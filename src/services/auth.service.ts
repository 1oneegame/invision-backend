import bcrypt from 'bcryptjs';
import type { Collection, ObjectId } from 'mongodb';
import { MongoServerError } from 'mongodb';

type JwtPayload = {
    sub: string;
    email: string;
};

type SignJwt = (payload: JwtPayload) => string;

type SignupInput = {
    name: string;
    email: string;
    mobile: string;
    password: string;
};

type SigninInput = {
    email: string;
    password: string;
};

export type AuthUserDocument = {
    _id?: ObjectId;
    name: string;
    email: string;
    mobile: string;
    passwordHash: string;
    createdAt: Date;
    updatedAt: Date;
};

export type AuthUserDto = {
    id: string;
    name: string;
    email: string;
    mobile: string;
};

export class AuthServiceError extends Error {
    statusCode: number;

    constructor(message: string, statusCode: number) {
        super(message);
        this.statusCode = statusCode;
    }
}

function normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
}

function normalizeMobile(mobile: string): string {
    return mobile.trim();
}

function toAuthUserDto(user: AuthUserDocument & { _id: ObjectId }): AuthUserDto {
    return {
        id: user._id.toHexString(),
        name: user.name,
        email: user.email,
        mobile: user.mobile,
    };
}

export function createAuthService(
    usersCollection: Collection<AuthUserDocument>,
    signJwt: SignJwt,
) {
    return {
        async signup(input: SignupInput): Promise<{ user: AuthUserDto }> {
            const now = new Date();
            const email = normalizeEmail(input.email);
            const mobile = normalizeMobile(input.mobile);
            const passwordHash = await bcrypt.hash(input.password, 12);

            try {
                const created = await usersCollection.insertOne({
                    name: input.name.trim(),
                    email,
                    mobile,
                    passwordHash,
                    createdAt: now,
                    updatedAt: now,
                });

                const savedUser = await usersCollection.findOne({ _id: created.insertedId });

                if (!savedUser) {
                    throw new AuthServiceError('Failed to create account', 500);
                }

                return { user: toAuthUserDto(savedUser) };
            } catch (error) {
                if (error instanceof MongoServerError && error.code === 11000) {
                    throw new AuthServiceError('Email is already registered', 409);
                }
                throw error;
            }
        },

        async signin(input: SigninInput): Promise<{ accessToken: string; user: AuthUserDto }> {
            const email = normalizeEmail(input.email);
            const user = await usersCollection.findOne({ email });

            if (!user) {
                throw new AuthServiceError('Invalid email or password', 401);
            }

            if (!user.passwordHash) {
                throw new AuthServiceError('Invalid email or password', 401);
            }

            const isPasswordValid = await bcrypt.compare(input.password, user.passwordHash);

            if (!isPasswordValid) {
                throw new AuthServiceError('Invalid email or password', 401);
            }

            const accessToken = signJwt({
                sub: user._id.toHexString(),
                email: user.email,
            });

            return {
                accessToken,
                user: toAuthUserDto(user),
            };
        },
    };
}