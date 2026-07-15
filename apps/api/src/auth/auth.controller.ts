import { Body, Controller, ForbiddenException, Get, Headers, Param, ParseUUIDPipe, Patch, Post, Query, Res } from "@nestjs/common";
import { FastifyReply } from "fastify";
import { z } from "zod";
import { ZodBodyPipe } from "../common/zod-body.pipe";
import { apiEnv } from "../env";
import { AuthService } from "./auth.service";
import { CurrentUser } from "./current-user.decorator";
import { Public } from "./public.decorator";
import { SESSION_COOKIE, SessionUser } from "./auth.types";

const registerSchema = z.object({
  email: z.string().email(),
  displayName: z.string().min(1).max(200),
  password: z.string().min(8).max(200),
});

const loginSchema = z.object({
  identifier: z.string().trim().min(1).max(254).optional(),
  email: z.string().trim().min(1).max(254).optional(),
  password: z.string().min(1).max(200),
  rememberMe: z.boolean().default(false),
}).refine((value) => Boolean(value.identifier || value.email), { message: "Identifier is required" });

const profileSchema = z.object({
  email: z.string().email().max(254),
  displayName: z.string().trim().min(1).max(200),
  firstName: z.string().trim().max(120).nullable().optional(),
  lastName: z.string().trim().max(120).nullable().optional(),
  jobTitle: z.string().trim().max(200).nullable().optional(),
  department: z.string().trim().max(200).nullable().optional(),
  phone: z.string().trim().max(60).nullable().optional(),
  bio: z.string().trim().max(2000).nullable().optional(),
});

type RegisterInput = z.infer<typeof registerSchema>;
type LoginInput = z.infer<typeof loginSchema>;

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post("register")
  async register(
    @Body(new ZodBodyPipe(registerSchema)) body: RegisterInput,
    @Headers("x-docsys-client") client: string | undefined,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const env = apiEnv();
    if (env.NODE_ENV === "production" && !env.ALLOW_PUBLIC_REGISTRATION) {
      throw new ForbiddenException("Public registration is disabled");
    }
    const result = await this.auth.register(body.email, body.displayName, body.password);
    this.setCookie(reply, result.token);
    return client === "desktop" ? { user: result.user, token: result.token } : { user: result.user };
  }

  @Public()
  @Post("login")
  async login(
    @Body(new ZodBodyPipe(loginSchema)) body: LoginInput,
    @Headers("x-docsys-client") client: string | undefined,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const result = await this.auth.login(body.identifier ?? body.email ?? "", body.password, body.rememberMe);
    this.setCookie(reply, result.token, body.rememberMe);
    return client === "desktop" ? { user: result.user, token: result.token } : { user: result.user };
  }

  @Public()
  @Get("client-config")
  clientConfig() {
    return { collaborationUrl: apiEnv().COLLAB_PUBLIC_URL };
  }

  @Public()
  @Get("sso/:orgSlug/start")
  async startSso(@Param("orgSlug") orgSlug: string, @Res() reply: FastifyReply) {
    const url = await this.auth.startSso(orgSlug);
    return reply.redirect(url);
  }

  @Public()
  @Get("sso/callback")
  async ssoCallback(
    @Query("code") code: string,
    @Query("state") state: string,
    @Res() reply: FastifyReply,
  ) {
    const result = await this.auth.completeSso(code, state);
    this.setCookie(reply, result.token);
    return reply.redirect(apiEnv().APP_BASE_URL);
  }

  @Post("logout")
  logout(@Res({ passthrough: true }) reply: FastifyReply) {
    reply.clearCookie(SESSION_COOKIE, { path: "/" });
    return { ok: true };
  }

  @Get("me")
  me(@CurrentUser() user: SessionUser) {
    return this.auth.profile(user.userId);
  }

  @Patch("me")
  updateMe(
    @CurrentUser() user: SessionUser,
    @Body(new ZodBodyPipe(profileSchema)) body: z.infer<typeof profileSchema>,
  ) {
    return this.auth.updateProfile(user.userId, body);
  }

  @Get("users/:userId")
  userProfile(
    @CurrentUser() user: SessionUser,
    @Param("userId", ParseUUIDPipe) userId: string,
  ) {
    return this.auth.publicProfile(user.userId, userId);
  }

  @Get("collab-token")
  collabToken(@CurrentUser() user: SessionUser) {
    return this.auth.collabToken(user.userId, user.email);
  }

  private setCookie(reply: FastifyReply, token: string, rememberMe = false): void {
    reply.setCookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "strict",
      secure: apiEnv().COOKIE_SECURE,
      path: "/",
      ...(rememberMe ? { maxAge: 60 * 60 * 24 * 30 } : {}),
    });
  }
}
