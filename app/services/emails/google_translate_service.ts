import axios from 'axios'
import env from '#start/env'

const GOOGLE_TRANSLATE_ENDPOINT = 'https://translation.googleapis.com/language/translate/v2'

interface GoogleTranslateResponse {
  data: {
    translations: Array<{ translatedText: string }>
  }
}

/**
 * Thin wrapper around the Google Cloud Translation API (v2, "Basic").
 * `format: 'text'` is required on every call — the API defaults to `html`,
 * which would re-escape entities in text we've already decoded ourselves
 * (see `html_translator.ts`).
 */
export default class GoogleTranslateService {
  async translate(texts: string[], targetLanguage: string): Promise<string[]> {
    if (texts.length === 0) return []

    const apiKey = env.get('GOOGLE_TRANSLATE_API_KEY')
    if (!apiKey) {
      throw new GoogleTranslateUnavailableError(
        new Error('GOOGLE_TRANSLATE_API_KEY is not configured')
      )
    }

    try {
      const { data } = await axios.post<GoogleTranslateResponse>(
        GOOGLE_TRANSLATE_ENDPOINT,
        {
          q: texts,
          target: targetLanguage,
          format: 'text',
        },
        { params: { key: apiKey.release() } }
      )

      return data.data.translations.map((translation) => translation.translatedText)
    } catch (error) {
      throw new GoogleTranslateUnavailableError(error)
    }
  }
}

/** Raised when the Google Translate API is unreachable, misconfigured, or errors out. */
export class GoogleTranslateUnavailableError extends Error {
  constructor(cause: unknown) {
    super('Unable to translate — the Google Translate API is unavailable or misconfigured.')
    this.cause = cause
  }
}
