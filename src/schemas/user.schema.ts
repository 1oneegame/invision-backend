import { Type } from "@sinclair/typebox";
import type { Static } from "@sinclair/typebox";

export const UserSchema = Type.Object({
    name: Type.String({ minLength: 1, maxLength: 120 }),
    surname: Type.Optional(Type.String({ minLength: 1, maxLength: 120 })),
    email: Type.String({ format: 'email' }),
    age: Type.Optional(Type.Number({ minimum: 0 })),
});

export const UserCreateBodySchema = UserSchema;

export const UserUpdateBodySchema = Type.Partial(UserSchema, {
    minProperties: 1,
});

export const UserParamsSchema = Type.Object({
    id: Type.String({ minLength: 1 }),
});

export const UserDocumentSchema = Type.Object({
    _id: Type.String(),
    name: Type.String(),
    surname: Type.Optional(Type.String()),
    email: Type.String({ format: 'email' }),
    age: Type.Optional(Type.Number({ minimum: 0 })),
});

export const UserListResponseSchema = Type.Array(UserDocumentSchema);

export const UserMutationResponseSchema = Type.Object({
    message: Type.String(),
});

export type User = Static<typeof UserSchema>;
export type UserCreateBody = Static<typeof UserCreateBodySchema>;
export type UserUpdateBody = Static<typeof UserUpdateBodySchema>;
export type UserParams = Static<typeof UserParamsSchema>;