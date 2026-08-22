import { z } from "zod";
import bcrypt from "bcryptjs";
import { TRPCError } from "@trpc/server";

import { protectedProcedure, router } from "../_core/trpc";
import { getUserById, updateUserProfile, updateUserPassword } from "../db";
import { upsertContato } from "../contatosStore";

/**
 * Perfil do usuário (auto-serviço) — cada um edita SÓ a si mesmo (escopo em `ctx.user.id`, não é
 * o admin de usuários). Foto = data URI pequeno (redimensionado no cliente) em `sys_usuarios.avatarUrl`.
 * WhatsApp corporativo espelha na base de contatos compartilhada (aparece no ContatoPicker).
 */
export const perfilRouter = router({
  /** Atualiza nome, foto e/ou WhatsApp do próprio usuário. Campos ausentes ficam como estão. */
  atualizar: protectedProcedure
    .input(
      z.object({
        name: z.string().trim().min(1).max(255).optional(),
        // data URI de imagem pequeno; cabe em TEXT (64KB). `null` limpa a foto.
        // Só aceitamos `data:image/...` — bloqueia URL externa (tracking/SSRF) e conteúdo não-imagem.
        avatarUrl: z
          .string()
          .max(60_000)
          .refine((v) => v.startsWith("data:image/"), "A foto deve ser uma imagem.")
          .nullable()
          .optional(),
        whatsapp: z.string().max(20).nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Normaliza WhatsApp para E.164 (só dígitos); '' ou null limpam.
      let whatsapp = input.whatsapp;
      if (whatsapp != null) {
        const dig = whatsapp.replace(/\D/g, "");
        whatsapp = dig.length ? dig : null;
      }

      const updated = await updateUserProfile(ctx.user.id, {
        name: input.name,
        avatarUrl: input.avatarUrl,
        whatsapp,
      });
      if (!updated) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Não foi possível atualizar o perfil." });
      }

      // Espelha o WhatsApp na base de contatos compartilhada (não bloqueia o perfil se falhar).
      if (whatsapp) {
        try {
          await upsertContato({ tipo: "contato", identificador: whatsapp, nome: updated.name });
        } catch {
          /* silencioso: o perfil já foi salvo */
        }
      }
      return { success: true };
    }),

  /** Troca a senha do próprio usuário, validando a atual. */
  alterarSenha: protectedProcedure
    .input(
      z.object({
        currentPassword: z.string().min(1),
        newPassword: z.string().min(6).max(200),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const user = await getUserById(ctx.user.id);
      if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "Usuário não encontrado." });
      if (!user.passwordHash) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Sua conta não usa senha local; não é possível alterá-la aqui.",
        });
      }
      const ok = await bcrypt.compare(input.currentPassword, user.passwordHash);
      if (!ok) throw new TRPCError({ code: "UNAUTHORIZED", message: "Senha atual incorreta." });

      const hash = await bcrypt.hash(input.newPassword, 10);
      await updateUserPassword(ctx.user.id, hash);
      return { success: true };
    }),
});
