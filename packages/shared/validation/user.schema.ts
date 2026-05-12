import { z } from 'zod';

export const SUPPORTED_LOCALES = ['en', 'es'] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export const setLocalePreferenceSchema = z.object({
  locale: z.enum(SUPPORTED_LOCALES),
});

export type SetLocalePreferenceInput = z.infer<typeof setLocalePreferenceSchema>;
