import { requirePermission } from "../_shared/auth.ts";
import {
  corsHeaders,
  errorResponse,
  HttpError,
  json,
  readJsonObject,
  requireMethod,
} from "../_shared/http.ts";
import { serviceClient } from "../_shared/client.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });
  try {
    requireMethod(request, "POST");
    const caller = await requirePermission(request, "USUARIO_ESCRIBIR");
    const body = await readJsonObject(request);
    const username = String(body.username ?? "")
      .trim()
      .toLowerCase();
    const fullName = String(body.fullName ?? "").trim();
    const password = String(body.password ?? "");
    const email = String(body.email ?? "")
      .trim()
      .toLowerCase();
    if (!/^[a-z0-9._-]{4,60}$/.test(username)) {
      throw new HttpError(
        400,
        "El usuario debe tener entre 4 y 60 caracteres válidos",
      );
    }
    if (fullName.length < 3 || fullName.length > 150) {
      throw new HttpError(
        400,
        "El nombre completo debe tener entre 3 y 150 caracteres",
      );
    }
    if (
      password.length < 10 ||
      password.length > 100 ||
      !/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/.test(password)
    ) {
      throw new HttpError(
        400,
        "La contraseña debe tener entre 10 y 100 caracteres, mayúscula, minúscula y número",
      );
    }
    if (
      email &&
      (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    ) {
      throw new HttpError(
        400,
        "El correo electrónico no tiene un formato válido",
      );
    }
    const requestedRoles = Array.isArray(body.roles)
      ? [
          ...new Set(
            body.roles.filter(
              (value): value is string => typeof value === "string",
            ),
          ),
        ].sort()
      : [];
    const allowedProfiles = [
      ["ADMINISTRADOR", "ODONTOLOGO"],
      ["CAJA"],
      ["ODONTOLOGO"],
      ["RECEPCION"],
    ];
    const validProfile = allowedProfiles.some(
      (profile) =>
        profile.length === requestedRoles.length &&
        profile.every((role, index) => role === requestedRoles[index]),
    );
    if (!validProfile) {
      throw new HttpError(400, "Selecciona un perfil de acceso válido");
    }
    const admin = serviceClient();
    const authEmail = email || `${username}@auth.dental-americana.invalid`;
    const created = await admin.auth.admin.createUser({
      email: authEmail,
      password,
      email_confirm: true,
      user_metadata: { username, full_name: fullName },
    });
    if (created.error || !created.data.user) {
      const duplicate =
        created.error?.message.toLowerCase().includes("already") ||
        created.error?.message.toLowerCase().includes("registered");
      throw new HttpError(
        duplicate ? 409 : 400,
        duplicate
          ? "Ya existe un usuario con ese correo o nombre de usuario"
          : "No se pudo crear el usuario",
      );
    }
    try {
      const profile = await admin
        .from("usuarios")
        .select("id")
        .eq("auth_user_id", created.data.user.id)
        .single();
      const roleResult = await admin
        .from("roles")
        .select("id")
        .in("codigo", requestedRoles)
        .eq("activo", true);
      const roleRows = roleResult.data ?? [];
      if (
        profile.error ||
        roleResult.error ||
        roleRows.length !== requestedRoles.length
      )
        throw new Error("No se pudo enlazar perfil y rol");
      const updated = await admin
        .from("usuarios")
        .update({ nombre_completo: fullName, email: email || null })
        .eq("id", profile.data.id);
      if (updated.error) throw updated.error;
      const assigned = await admin.from("usuarios_roles").insert(
        roleRows.map((role) => ({
          usuario_id: profile.data.id,
          rol_id: role.id,
        })),
      );
      if (assigned.error) throw assigned.error;
      const users = await caller.rpc("listar_usuarios");
      if (users.error) throw users.error;
      const result = (users.data as unknown as Array<{ id: number }>).find(
        (item) => item.id === profile.data.id,
      );
      if (!result) throw new Error("No se pudo recuperar el usuario creado");
      return json(result, 201);
    } catch (error) {
      await admin.auth.admin.deleteUser(created.data.user.id);
      throw error;
    }
  } catch (error) {
    return errorResponse(error);
  }
});
