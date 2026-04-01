import bcrypt from 'bcryptjs';
import type { Collection, ObjectId } from 'mongodb';
import { MongoServerError } from 'mongodb';

export type AuthErrorCode = 'invalid_credentials' | 'email_exists' | 'validation' | 'unknown';

type JwtPayload = {
    sub: string;
    email: string;
};

type SignJwt = (payload: JwtPayload) => string;

type SignupInput = {
    name: string;
    surname: string;
    email: string;
    phone: string;
    password: string;
};

type SigninInput = {
    email: string;
    password: string;
};

export type AuthUserDocument = {
    _id?: ObjectId;
    name: string;
    surname?: string;
    email: string;
    phone: string;
    passwordHash: string;
    createdAt: Date;
    updatedAt: Date;
};

export type AuthUserDto = {
    id: string;
    name: string;
    surname?: string | undefined;
    email: string;
    phone: string;
};

export class AuthServiceError extends Error {
    statusCode: number;
    code: AuthErrorCode;

    constructor(message: string, statusCode: number, code: AuthErrorCode = 'unknown') {
        super(message);
        this.statusCode = statusCode;
        this.code = code;
    }
}

function normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
}

function normalizePhone(phone: string): string {
    return phone.trim();
}

function toAuthUserDto(user: AuthUserDocument & { _id: ObjectId }): AuthUserDto {
    return {
        id: user._id.toHexString(),
        name: user.name,
        surname: user.surname,
        email: user.email,
        phone: user.phone,
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
            const phone = normalizePhone(input.phone);
            const passwordHash = await bcrypt.hash(input.password, 12);

            try {
                const created = await usersCollection.insertOne({
                    name: input.name.trim(),
                    surname: input.surname.trim(),
                    email,
                    phone,
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
                    throw new AuthServiceError('Email is already registered', 409, 'email_exists');
                }
                throw error;
            }
        },

        async signin(input: SigninInput): Promise<{ accessToken: string; user: AuthUserDto }> {
            const email = normalizeEmail(input.email);
            const user = await usersCollection.findOne({ email });

            if (!user) {
                throw new AuthServiceError('Invalid email or password', 401, 'invalid_credentials');
            }

            if (!user.passwordHash) {
                throw new AuthServiceError('Invalid email or password', 401, 'invalid_credentials');
            }

            const isPasswordValid = await bcrypt.compare(input.password, user.passwordHash);

            if (!isPasswordValid) {
                throw new AuthServiceError('Invalid email or password', 401, 'invalid_credentials');
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