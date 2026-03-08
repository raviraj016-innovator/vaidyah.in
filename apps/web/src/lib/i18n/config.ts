/**
 * Internationalization configuration.
 *
 * UI dictionaries are provided for 13 Indian languages.
 * All 22+ Scheduled Languages of India are listed for backend
 * voice/NLU processing.
 */

export type Locale =
  | 'en' | 'hi' | 'bn' | 'ta' | 'te' | 'mr' | 'gu'
  | 'kn' | 'ml' | 'pa' | 'or' | 'ur' | 'as';

export const locales: Locale[] = [
  'en', 'hi', 'bn', 'ta', 'te', 'mr', 'gu',
  'kn', 'ml', 'pa', 'or', 'ur', 'as',
];

export const localeNames: Record<Locale, string> = {
  en: 'English',
  hi: '\u0939\u093F\u0928\u094D\u0926\u0940',
  bn: '\u09AC\u09BE\u0982\u09B2\u09BE',
  ta: '\u0BA4\u0BAE\u0BBF\u0BB4\u0BCD',
  te: '\u0C24\u0C46\u0C32\u0C41\u0C17\u0C41',
  mr: '\u092E\u0930\u093E\u0920\u0940',
  gu: '\u0A97\u0AC1\u0A9C\u0AB0\u0ABE\u0AA4\u0AC0',
  kn: '\u0C95\u0CA8\u0CCD\u0CA8\u0CA1',
  ml: '\u0D2E\u0D32\u0D2F\u0D3E\u0D33\u0D02',
  pa: '\u0A2A\u0A70\u0A1C\u0A3E\u0A2C\u0A40',
  or: '\u0B13\u0B21\u0B3C\u0B3F\u0B06',
  ur: '\u0627\u0631\u062F\u0648',
  as: '\u0985\u09B8\u09AE\u09C0\u09AF\u09BC\u09BE',
};

/**
 * All 22 Scheduled Languages of India + English.
 * Used for voice input language selection and NLU processing.
 */
export type VoiceLanguageCode =
  | 'en-IN' | 'hi-IN' | 'bn-IN' | 'ta-IN' | 'te-IN' | 'mr-IN'
  | 'gu-IN' | 'kn-IN' | 'ml-IN' | 'pa-IN' | 'or-IN' | 'as-IN'
  | 'ur-IN' | 'mai-IN' | 'sat-IN' | 'ks-IN' | 'ne-IN' | 'sd-IN'
  | 'kok-IN' | 'doi-IN' | 'mni-IN' | 'brx-IN' | 'sa-IN';

export const voiceLanguages: { code: VoiceLanguageCode; name: string; nativeName: string }[] = [
  { code: 'en-IN', name: 'English', nativeName: 'English' },
  { code: 'hi-IN', name: 'Hindi', nativeName: '\u0939\u093F\u0928\u094D\u0926\u0940' },
  { code: 'bn-IN', name: 'Bengali', nativeName: '\u09AC\u09BE\u0982\u09B2\u09BE' },
  { code: 'ta-IN', name: 'Tamil', nativeName: '\u0BA4\u0BAE\u0BBF\u0BB4\u0BCD' },
  { code: 'te-IN', name: 'Telugu', nativeName: '\u0C24\u0C46\u0C32\u0C41\u0C17\u0C41' },
  { code: 'mr-IN', name: 'Marathi', nativeName: '\u092E\u0930\u093E\u0920\u0940' },
  { code: 'gu-IN', name: 'Gujarati', nativeName: '\u0A97\u0AC1\u0A9C\u0AB0\u0ABE\u0AA4\u0AC0' },
  { code: 'kn-IN', name: 'Kannada', nativeName: '\u0C95\u0CA8\u0CCD\u0CA8\u0CA1' },
  { code: 'ml-IN', name: 'Malayalam', nativeName: '\u0D2E\u0D32\u0D2F\u0D3E\u0D33\u0D02' },
  { code: 'pa-IN', name: 'Punjabi', nativeName: '\u0A2A\u0A70\u0A1C\u0A3E\u0A2C\u0A40' },
  { code: 'or-IN', name: 'Odia', nativeName: '\u0B13\u0B21\u0B3C\u0B3F\u0B06' },
  { code: 'as-IN', name: 'Assamese', nativeName: '\u0985\u09B8\u09AE\u09C0\u09AF\u09BC\u09BE' },
  { code: 'ur-IN', name: 'Urdu', nativeName: '\u0627\u0631\u062F\u0648' },
  { code: 'mai-IN', name: 'Maithili', nativeName: '\u092E\u0948\u0925\u093F\u0932\u0940' },
  { code: 'sat-IN', name: 'Santali', nativeName: '\u1C65\u1C5F\u1C71\u1C5B\u1C5F\u1C63\u1C64' },
  { code: 'ks-IN', name: 'Kashmiri', nativeName: '\u0643\u0672\u0634\u064F\u0631' },
  { code: 'ne-IN', name: 'Nepali', nativeName: '\u0928\u0947\u092A\u093E\u0932\u0940' },
  { code: 'sd-IN', name: 'Sindhi', nativeName: '\u0633\u0646\u068C\u064A' },
  { code: 'kok-IN', name: 'Konkani', nativeName: '\u0915\u094B\u0902\u0915\u0923\u0940' },
  { code: 'doi-IN', name: 'Dogri', nativeName: '\u0921\u094B\u0917\u0930\u0940' },
  { code: 'mni-IN', name: 'Manipuri', nativeName: '\uABC3\uABE3\uABC7\uABE5\uABC2\uABED' },
  { code: 'brx-IN', name: 'Bodo', nativeName: '\u092C\u0930\u094B' },
  { code: 'sa-IN', name: 'Sanskrit', nativeName: '\u0938\u0902\u0938\u094D\u0915\u0943\u0924\u092E\u094D' },
];
