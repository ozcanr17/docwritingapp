import { ConflictException, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcryptjs";
import { PrismaService } from "../prisma/prisma.service";
import { Issuer, generators } from "openid-client";
import { apiEnv } from "../env";
import { AccessService } from "../access/access.service";

export interface AuthResult {
  token: string;
  user: { id: string; email: string; displayName: string; locale: string };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly access: AccessService,
  ) {}

  async register(email: string, displayName: string, password: string): Promise<AuthResult> {
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) throw new ConflictException("Email already registered");
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await this.prisma.user.create({
      data: { email, displayName, passwordHash },
    });
    return this.issue(user.id, user.email, user.displayName, user.locale);
  }

  async login(email: string, password: string): Promise<AuthResult> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !user.passwordHash || user.deletedAt || !user.isActive) {
      throw new UnauthorizedException("Invalid credentials");
    }
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw new UnauthorizedException("Invalid credentials");
    return this.issue(user.id, user.email, user.displayName, user.locale);
  }

  async profile(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, email: true, displayName: true, locale: true, themePreference: true },
    });
    return user;
  }

  async collabToken(userId: string, email: string): Promise<{ token: string }> {
    const token = await this.jwt.signAsync({ sub: userId, email }, { expiresIn: "1h" });
    return { token };
  }

  async startSso(orgSlug: string): Promise<string> {
    const organization = await this.prisma.organization.findFirst({ where: { slug: orgSlug, deletedAt: null } });
    if (!organization) throw new UnauthorizedException("SSO organization not found");
    const oidc = (organization.settings as Record<string, unknown>).oidc as Record<string, unknown> | undefined;
    if (!oidc || oidc.enabled !== true || typeof oidc.issuer !== "string" || typeof oidc.clientId !== "string") {
      throw new UnauthorizedException("SSO is not enabled");
    }
    const issuer = await Issuer.discover(oidc.issuer);
    const client = new issuer.Client({ client_id: oidc.clientId, token_endpoint_auth_method: "none" });
    const codeVerifier = generators.codeVerifier();
    const nonce = generators.nonce();
    const csrf = generators.state();
    const state = await this.jwt.signAsync(
      { type: "oidc", organizationId: organization.id, codeVerifier, nonce, csrf },
      { expiresIn: "10m" },
    );
    return client.authorizationUrl({
      scope: Array.isArray(oidc.scopes) ? oidc.scopes.join(" ") : "openid profile email",
      redirect_uri: `${apiEnv().API_PUBLIC_URL}/auth/sso/callback`,
      response_type: "code",
      code_challenge: generators.codeChallenge(codeVerifier),
      code_challenge_method: "S256",
      state,
      nonce,
    });
  }

  async completeSso(code: string, state: string): Promise<AuthResult> {
    if (!code || !state) throw new UnauthorizedException("Invalid SSO callback");
    const payload = await this.jwt.verifyAsync<{
      type: string;
      organizationId: string;
      codeVerifier: string;
      nonce: string;
    }>(state);
    if (payload.type !== "oidc") throw new UnauthorizedException("Invalid SSO state");
    const organization = await this.prisma.organization.findFirst({ where: { id: payload.organizationId, deletedAt: null } });
    if (!organization) throw new UnauthorizedException("SSO organization not found");
    const oidc = (organization.settings as Record<string, unknown>).oidc as Record<string, unknown>;
    const issuer = await Issuer.discover(String(oidc.issuer));
    const client = new issuer.Client({ client_id: String(oidc.clientId), token_endpoint_auth_method: "none" });
    const tokenSet = await client.callback(
      `${apiEnv().API_PUBLIC_URL}/auth/sso/callback`,
      { code, state },
      { state, nonce: payload.nonce, code_verifier: payload.codeVerifier },
    );
    const claims = tokenSet.claims();
    const subject = `${issuer.issuer}|${claims.sub}`;
    const email = typeof claims.email === "string" ? claims.email.toLocaleLowerCase("en") : null;
    if (!email) throw new UnauthorizedException("SSO provider did not return an email");
    const displayName = typeof claims.name === "string" ? claims.name : email;
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing?.oidcSubject && existing.oidcSubject !== subject) throw new UnauthorizedException("SSO identity does not match the linked account");
    const user = await this.prisma.user.upsert({
      where: { email },
      create: { email, displayName, oidcSubject: subject },
      update: { displayName, oidcSubject: subject, isActive: true },
    });
    await this.prisma.organizationMember.upsert({
      where: { organizationId_userId: { organizationId: organization.id, userId: user.id } },
      create: { organizationId: organization.id, userId: user.id },
      update: { deletedAt: null },
    });
    await this.access.grantRole(user.id, "viewer", { organizationId: organization.id }, "organization");
    return this.issue(user.id, user.email, user.displayName, user.locale);
  }

  private async issue(id: string, email: string, displayName: string, locale: string): Promise<AuthResult> {
    const token = await this.jwt.signAsync({ sub: id, email });
    return { token, user: { id, email, displayName, locale } };
  }
}
