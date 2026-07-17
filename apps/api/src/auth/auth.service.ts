import { ConflictException, ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcryptjs";
import { PrismaService } from "../prisma/prisma.service";
import { Issuer, generators } from "openid-client";
import { apiEnv } from "../env";
import { AccessService } from "../access/access.service";
import { AuditService } from "../audit/audit.service";

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
    private readonly audit: AuditService,
  ) {}

  async register(email: string, displayName: string, password: string): Promise<AuthResult> {
    const normalizedEmail = email.trim().toLocaleLowerCase("en");
    const existing = await this.prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existing) throw new ConflictException("Email already registered");
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await this.prisma.user.create({
      data: { email: normalizedEmail, displayName, passwordHash },
    });
    return this.issue(user.id, user.email, user.displayName, user.locale);
  }

  async login(identifier: string, password: string, rememberMe = false): Promise<AuthResult> {
    const email = this.resolveLoginEmail(identifier);
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !user.passwordHash || user.deletedAt || !user.isActive) {
      throw new UnauthorizedException("Invalid credentials");
    }
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw new UnauthorizedException("Invalid credentials");
    return this.issue(user.id, user.email, user.displayName, user.locale, rememberMe);
  }

  private resolveLoginEmail(identifier: string): string {
    const normalized = identifier.trim().toLocaleLowerCase("en");
    if (normalized.includes("@")) return normalized;
    if (!/^[a-z0-9._-]+$/.test(normalized)) throw new UnauthorizedException("Invalid credentials");
    return `${normalized}@docsys.local`;
  }

  async profile(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId, deletedAt: null, isActive: true },
      select: { id: true, email: true, displayName: true, firstName: true, lastName: true, jobTitle: true, department: true, phone: true, bio: true, locale: true, themePreference: true },
    });
    return user;
  }

  async publicProfile(viewerId: string, userId: string) {
    const sharedOrganization = viewerId === userId || await this.prisma.organizationMember.count({
      where: {
        userId,
        deletedAt: null,
        organization: { deletedAt: null, members: { some: { userId: viewerId, deletedAt: null, user: { deletedAt: null, isActive: true } } } },
        user: { deletedAt: null, isActive: true },
      },
    }) > 0;
    if (!sharedOrganization) throw new ForbiddenException("User profile is not available");
    return this.profile(userId);
  }

  async updateProfile(userId: string, input: {
    email: string;
    displayName: string;
    firstName?: string | null;
    lastName?: string | null;
    jobTitle?: string | null;
    department?: string | null;
    phone?: string | null;
    bio?: string | null;
  }) {
    const email = input.email.trim().toLocaleLowerCase("en");
    const existing = await this.prisma.user.findFirst({ where: { email, id: { not: userId } }, select: { id: true } });
    if (existing) throw new ConflictException("Email already registered");
    return this.prisma.$transaction(async (tx) => {
      const previous = await tx.user.findUniqueOrThrow({ where: { id: userId } });
      const updated = await tx.user.update({
        where: { id: userId },
        data: {
          email,
          displayName: input.displayName.trim(),
          firstName: input.firstName?.trim() || null,
          lastName: input.lastName?.trim() || null,
          jobTitle: input.jobTitle?.trim() || null,
          department: input.department?.trim() || null,
          phone: input.phone?.trim() || null,
          bio: input.bio?.trim() || null,
        },
        select: { id: true, email: true, displayName: true, firstName: true, lastName: true, jobTitle: true, department: true, phone: true, bio: true, locale: true, themePreference: true },
      });
      const memberships = await tx.organizationMember.findMany({ where: { userId, deletedAt: null }, select: { organizationId: true } });
      for (const membership of memberships) {
        await this.audit.record(tx, {
          organizationId: membership.organizationId,
          actorId: userId,
          action: "user.profile.updated",
          entityType: "user",
          entityId: userId,
          previousData: { email: previous.email, displayName: previous.displayName },
          nextData: { email: updated.email, displayName: updated.displayName },
        });
      }
      return updated;
    });
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
    if (claims.email_verified !== true) throw new UnauthorizedException("SSO provider did not verify the email");
    const displayName = typeof claims.name === "string" ? claims.name : email;
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing && (!existing.oidcSubject || existing.oidcSubject !== subject)) throw new UnauthorizedException("SSO identity is not linked to this account");
    if (existing && (existing.deletedAt || !existing.isActive)) throw new UnauthorizedException("SSO account is inactive");
    const membership = existing ? await this.prisma.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId: organization.id, userId: existing.id } },
    }) : null;
    if (membership?.deletedAt) throw new UnauthorizedException("SSO organization membership is inactive");
    const user = await this.prisma.user.upsert({
      where: { email },
      create: { email, displayName, oidcSubject: subject },
      update: { displayName },
    });
    if (!membership) {
      await this.prisma.organizationMember.upsert({
        where: { organizationId_userId: { organizationId: organization.id, userId: user.id } },
        create: { organizationId: organization.id, userId: user.id },
        update: {},
      });
    }
    await this.access.grantRole(user.id, "viewer", { organizationId: organization.id }, "organization");
    return this.issue(user.id, user.email, user.displayName, user.locale);
  }

  private async issue(id: string, email: string, displayName: string, locale: string, rememberMe = false): Promise<AuthResult> {
    const token = await this.jwt.signAsync({ sub: id, email }, { expiresIn: rememberMe ? "30d" : "12h" });
    return { token, user: { id, email, displayName, locale } };
  }
}
