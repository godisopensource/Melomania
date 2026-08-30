import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { db } from "./db";
import { User } from "@/types";

const SESSION_COOKIE_NAME = "melomania_session";

export async function getSessionUser(): Promise<User | null> {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME);
    
    if (!sessionCookie?.value) {
      return null;
    }

    const userId = sessionCookie.value;
    const user = db.getUserById(userId);
    return user || null;
  } catch (err) {
    return null;
  }
}

export async function loginUser(emailOrUsername: string, passwordPlain: string): Promise<{ user?: User; error?: string }> {
  const isEmail = emailOrUsername.includes("@");
  const user = isEmail
    ? db.getUserByEmail(emailOrUsername)
    : db.getUserByUsername(emailOrUsername);

  if (!user || !user.passwordHash) {
    return { error: "Invalid credentials." };
  }

  const isValid = bcrypt.compareSync(passwordPlain, user.passwordHash);
  if (!isValid) {
    return { error: "Incorrect password." };
  }

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, user.id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });

  return { user };
}

export async function registerUser(input: {
  email: string;
  username: string;
  displayName?: string;
  passwordPlain: string;
}): Promise<{ user?: User; error?: string }> {
  const existingEmail = db.getUserByEmail(input.email);
  if (existingEmail) {
    return { error: "This email address is already in use." };
  }

  const existingUsername = db.getUserByUsername(input.username);
  if (existingUsername) {
    return { error: "This username is already taken." };
  }

  const cleanUsername = input.username.toLowerCase().replace(/[^a-z0-9_-]/g, "");
  if (cleanUsername.length < 3) {
    return { error: "Username must be at least 3 alphanumeric characters." };
  }

  const passwordHash = bcrypt.hashSync(input.passwordPlain, 10);
  const now = new Date().toISOString();

  const newUser: User = {
    id: `usr_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    email: input.email.trim().toLowerCase(),
    username: cleanUsername,
    displayName: input.displayName?.trim() || cleanUsername,
    avatarUrl: `https://api.dicebear.com/7.x/bottts/svg?seed=${cleanUsername}`,
    isPublic: true,
    passwordHash,
    role: "user",
    createdAt: now,
    updatedAt: now,
  };

  db.createUser(newUser);

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, newUser.id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  return { user: newUser };
}

export async function logoutUser(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

export async function switchDemoUser(userId: string): Promise<User | null> {
  const user = db.getUserById(userId);
  if (user) {
    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE_NAME, user.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    return user;
  }
  return null;
}
