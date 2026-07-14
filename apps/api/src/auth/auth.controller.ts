import { Body, Controller, Get, Post, Res } from "@nestjs/common";
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
  email: z.string().email(),
  password: z.string().min(1),
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
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const result = await this.auth.register(body.email, body.displayName, body.password);
    this.setCookie(reply, result.token);
    return { user: result.user };
  }

  @Public()
  @Post("login")
  async login(
    @Body(new ZodBodyPipe(loginSchema)) body: LoginInput,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const result = await this.auth.login(body.email, body.password);
    this.setCookie(reply, result.token);
    return { user: result.user };
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

  private setCookie(reply: FastifyReply, token: string): void {
    reply.setCookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "strict",
      secure: apiEnv().COOKIE_SECURE,
      path: "/",
      maxAge: 60 * 60 * 12,
    });
  }
}
