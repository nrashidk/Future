import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^05\d{8}$/;

export function validateEmail(value: string): string {
  if (!value) return "";
  return EMAIL_RE.test(value.trim()) ? "" : "Enter a valid email (e.g. user@domain.com)";
}

export function validatePhone(value: string): string {
  if (!value) return "";
  return PHONE_RE.test(value.trim())
    ? ""
    : "Phone must be 10 digits starting with 05 (e.g. 0501234567)";
}

export function sanitizePhone(value: string): string {
  return value.replace(/\D/g, "").slice(0, 10);
}
