const path = require('path');

const APP_NAME = 'StreamPe';
const APP_VERSION = '2.4.1';
const DEFAULT_PORT = 2907;
const FALLBACK_PORTS = [DEFAULT_PORT, 8876, 2708, 9091, 1001, 0];
const UDP_DISCOVERY_PORT = 58025;
const MDNS_SERVICE_TYPE = 'streampe';
const MDNS_LEGACY_SERVICE_TYPE = 'payment-alerts';
const MAX_REDOS_INPUT_LENGTH = 300;
const NETWORK_CHANGE_CHECK_INTERVAL_MS = 10000;
const ANDROID_HEARTBEAT_INTERVAL_MS = 5000;
const OBS_HEARTBEAT_INTERVAL_MS = 15000;

function getDefaultAppDataDir() {
  const appData = process.env.APPDATA || (
    process.platform === 'darwin'
      ? path.join(process.env.HOME || '', 'Library', 'Application Support')
      : path.join(process.env.HOME || '', '.config')
  );
  return path.join(appData, APP_NAME);
}

const DISCORD_URL = 'https://partially-practical.codepenguin.in';
const WEBSITE_URL = 'https://partially-practical.codepenguin.in';
const GITHUB_REPO_URL = 'https://github.com/clowneon1/streampe';

// ── Text-to-Speech (TTS) Constants ──
const EDGE_TRUSTED_CLIENT_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
const WIN_EPOCH = 11644473600n;
const EDGE_TTS_VOICES_URL = `https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/voices/list?trustedclienttoken=${EDGE_TRUSTED_CLIENT_TOKEN}`;
const EDGE_TTS_WS_URL_BASE = 'wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1';
const EDGE_TTS_TIMEOUT_MS = 8000;
const EDGE_VOICE_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const GOOGLE_TTS_URL = 'https://translate.google.com/translate_tts';
const DEFAULT_TTS_VOICE = 'en-IN-NeerjaNeural';

const FALLBACK_EDGE_VOICES = [
  { id: 'en-IN-NeerjaNeural', name: 'Neerja', shortName: 'Neerja', gender: 'Female', locale: 'en-IN', friendlyLocale: 'English (India)', persona: 'Expressive & natural • Streamer favorite for desi banter', tags: 'indian hinglish gaming female popular', group: 'Indian / Hinglish' },
  { id: 'en-IN-PrabhatNeural', name: 'Prabhat', shortName: 'Prabhat', gender: 'Male', locale: 'en-IN', friendlyLocale: 'Hindi & Hinglish', persona: 'Punchy bass shoutouts • High energy BGMI / Valorant alerts', tags: 'indian hinglish gaming male popular', group: 'Indian / Hinglish' },
  { id: 'hi-IN-SwaraNeural', name: 'Swara', shortName: 'Swara', gender: 'Female', locale: 'hi-IN', friendlyLocale: 'Hindi (India)', persona: 'Melodic Hindi • Clear & expressive donation announcements', tags: 'indian hindi calm female popular', group: 'Indian / Hinglish' },
  { id: 'hi-IN-MadhurNeural', name: 'Madhur', shortName: 'Madhur', gender: 'Male', locale: 'hi-IN', friendlyLocale: 'Hindi (India)', persona: 'Resonant & deep • Authentic Hindi voice for epic moments', tags: 'indian hindi gaming male popular', group: 'Indian / Hinglish' },
  { id: 'mr-IN-AarohiNeural', name: 'Aarohi (Marathi)', shortName: 'Aarohi', gender: 'Female', locale: 'mr-IN', friendlyLocale: 'Marathi (India)', persona: 'Authentic Marathi donation announcer', tags: 'indian marathi regional female', group: 'Indian / Regional' },
  { id: 'mr-IN-ManoharNeural', name: 'Manohar (Marathi)', shortName: 'Manohar', gender: 'Male', locale: 'mr-IN', friendlyLocale: 'Marathi (India)', persona: 'Crisp & expressive Marathi narrator', tags: 'indian marathi regional male', group: 'Indian / Regional' },
  { id: 'ta-IN-PallaviNeural', name: 'Pallavi (Tamil)', shortName: 'Pallavi', gender: 'Female', locale: 'ta-IN', friendlyLocale: 'Tamil (India)', persona: 'Clear & energetic Tamil streamer voice', tags: 'indian tamil regional female', group: 'Indian / Regional' },
  { id: 'ta-IN-ValluvarNeural', name: 'Valluvar (Tamil)', shortName: 'Valluvar', gender: 'Male', locale: 'ta-IN', friendlyLocale: 'Tamil (India)', persona: 'Deep & resonant Tamil narrator', tags: 'indian tamil regional male', group: 'Indian / Regional' },
  { id: 'te-IN-ShrutiNeural', name: 'Shruti (Telugu)', shortName: 'Shruti', gender: 'Female', locale: 'te-IN', friendlyLocale: 'Telugu (India)', persona: 'Upbeat Telugu alerts & bits', tags: 'indian telugu regional female', group: 'Indian / Regional' },
  { id: 'te-IN-MohanNeural', name: 'Mohan (Telugu)', shortName: 'Mohan', gender: 'Male', locale: 'te-IN', friendlyLocale: 'Telugu (India)', persona: 'Bold & clear Telugu shoutouts', tags: 'indian telugu regional male', group: 'Indian / Regional' },
  { id: 'bn-IN-TanishaaNeural', name: 'Tanishaa (Bengali)', shortName: 'Tanishaa', gender: 'Female', locale: 'bn-IN', friendlyLocale: 'Bengali (India)', persona: 'Sweet & clear Bengali donation alerts', tags: 'indian bengali regional female', group: 'Indian / Regional' },
  { id: 'bn-IN-BashkarNeural', name: 'Bashkar (Bengali)', shortName: 'Bashkar', gender: 'Male', locale: 'bn-IN', friendlyLocale: 'Bengali (India)', persona: 'Natural Bengali narrator', tags: 'indian bengali regional male', group: 'Indian / Regional' },
  { id: 'gu-IN-DhwaniNeural', name: 'Dhwani (Gujarati)', shortName: 'Dhwani', gender: 'Female', locale: 'gu-IN', friendlyLocale: 'Gujarati (India)', persona: 'Bright Gujarati community announcer', tags: 'indian gujarati regional female', group: 'Indian / Regional' },
  { id: 'gu-IN-NiranjanNeural', name: 'Niranjan (Gujarati)', shortName: 'Niranjan', gender: 'Male', locale: 'gu-IN', friendlyLocale: 'Gujarati (India)', persona: 'Authentic Gujarati voice', tags: 'indian gujarati regional male', group: 'Indian / Regional' },
  { id: 'kn-IN-SapnaNeural', name: 'Sapna (Kannada)', shortName: 'Sapna', gender: 'Female', locale: 'kn-IN', friendlyLocale: 'Kannada (India)', persona: 'Expressive Kannada alert voice', tags: 'indian kannada regional female', group: 'Indian / Regional' },
  { id: 'kn-IN-GaganNeural', name: 'Gagan (Kannada)', shortName: 'Gagan', gender: 'Male', locale: 'kn-IN', friendlyLocale: 'Kannada (India)', persona: 'Resonant Kannada narrator', tags: 'indian kannada regional male', group: 'Indian / Regional' },
  { id: 'ml-IN-SobhanaNeural', name: 'Sobhana (Malayalam)', shortName: 'Sobhana', gender: 'Female', locale: 'ml-IN', friendlyLocale: 'Malayalam (India)', persona: 'Authentic Malayalam narrator', tags: 'indian malayalam regional female', group: 'Indian / Regional' },
  { id: 'ml-IN-MidhunNeural', name: 'Midhun (Malayalam)', shortName: 'Midhun', gender: 'Male', locale: 'ml-IN', friendlyLocale: 'Malayalam (India)', persona: 'Punchy Malayalam voice', tags: 'indian malayalam regional male', group: 'Indian / Regional' },
  { id: 'pa-IN-OjasNeural', name: 'Ojas (Punjabi)', shortName: 'Ojas', gender: 'Male', locale: 'pa-IN', friendlyLocale: 'Punjabi (India)', persona: 'Energetic Punjabi stream shoutouts', tags: 'indian punjabi regional male', group: 'Indian / Regional' },
  { id: 'pa-IN-VaaniNeural', name: 'Vaani (Punjabi)', shortName: 'Vaani', gender: 'Female', locale: 'pa-IN', friendlyLocale: 'Punjabi (India)', persona: 'Vibrant Punjabi alert voice', tags: 'indian punjabi regional female', group: 'Indian / Regional' },
  { id: 'ur-IN-GulNeural', name: 'Gul (Urdu)', shortName: 'Gul', gender: 'Female', locale: 'ur-IN', friendlyLocale: 'Urdu (India)', persona: 'Graceful Urdu stream alerts', tags: 'indian urdu regional female', group: 'Indian / Regional' },
  { id: 'ur-IN-SalmanNeural', name: 'Salman (Urdu)', shortName: 'Salman', gender: 'Male', locale: 'ur-IN', friendlyLocale: 'Urdu (India)', persona: 'Classic Urdu narrator', tags: 'indian urdu regional male', group: 'Indian / Regional' },
  { id: 'en-US-JennyNeural', name: 'Jenny', shortName: 'Jenny', gender: 'Female', locale: 'en-US', friendlyLocale: 'English (US)', persona: 'Warm & welcoming community tone • Crisp Twitch standard', tags: 'us english calm female popular', group: 'English (US)' },
  { id: 'en-US-GuyNeural', name: 'Guy', shortName: 'Guy', gender: 'Male', locale: 'en-US', friendlyLocale: 'English (US)', persona: 'Broadcast studio clarity • Crisp, resonant esports narrator', tags: 'us english gaming male popular', group: 'English (US)' },
  { id: 'en-US-AriaNeural', name: 'Aria', shortName: 'Aria', gender: 'Female', locale: 'en-US', friendlyLocale: 'English (US)', persona: 'High cadence & upbeat • Built for rapid succession bits', tags: 'us english gaming female popular', group: 'English (US)' },
  { id: 'en-GB-SoniaNeural', name: 'Sonia (UK)', shortName: 'Sonia', gender: 'Female', locale: 'en-GB', friendlyLocale: 'English (UK)', persona: 'Refined British accent for sleek streams', tags: 'uk english female', group: 'English (UK)' },
  { id: 'en-GB-RyanNeural', name: 'Ryan (UK)', shortName: 'Ryan', gender: 'Male', locale: 'en-GB', friendlyLocale: 'English (UK)', persona: 'Modern British narrator', tags: 'uk english male', group: 'English (UK)' },
  { id: 'en-AU-NatashaNeural', name: 'Natasha (Australia)', shortName: 'Natasha', gender: 'Female', locale: 'en-AU', friendlyLocale: 'English (Australia)', persona: 'Friendly Australian tone', tags: 'australia english female', group: 'Global AI' },
  { id: 'ja-JP-NanamiNeural', name: 'Nanami (Japanese)', shortName: 'Nanami', gender: 'Female', locale: 'ja-JP', friendlyLocale: 'Japanese', persona: 'Expressive anime & gaming streamer voice', tags: 'japanese gaming female global', group: 'Global AI' },
  { id: 'ko-KR-SunHiNeural', name: 'SunHi (Korean)', shortName: 'SunHi', gender: 'Female', locale: 'ko-KR', friendlyLocale: 'Korean', persona: 'Crisp K-Wave esports alert narrator', tags: 'korean gaming female global', group: 'Global AI' },
  { id: 'es-ES-ElviraNeural', name: 'Elvira (Spanish)', shortName: 'Elvira', gender: 'Female', locale: 'es-ES', friendlyLocale: 'Spanish (Spain)', persona: 'Natural Spanish voice', tags: 'spanish female global', group: 'Global AI' },
  { id: 'fr-FR-DeniseNeural', name: 'Denise (French)', shortName: 'Denise', gender: 'Female', locale: 'fr-FR', friendlyLocale: 'French (France)', persona: 'Melodic French narrator', tags: 'french female global', group: 'Global AI' },
  { id: 'de-DE-KatjaNeural', name: 'Katja (German)', shortName: 'Katja', gender: 'Female', locale: 'de-DE', friendlyLocale: 'German', persona: 'Clear German announcer', tags: 'german female global', group: 'Global AI' },
  { id: 'ru-RU-SvetlanaNeural', name: 'Svetlana (Russian)', shortName: 'Svetlana', gender: 'Female', locale: 'ru-RU', friendlyLocale: 'Russian', persona: 'Rich Russian gaming narrator', tags: 'russian female global', group: 'Global AI' },
  { id: 'pt-BR-FranciscaNeural', name: 'Francisca (Portuguese)', shortName: 'Francisca', gender: 'Female', locale: 'pt-BR', friendlyLocale: 'Portuguese (Brazil)', persona: 'Lively Brazilian gaming alert voice', tags: 'portuguese female global', group: 'Global AI' },
  { id: 'ar-SA-ZariyahNeural', name: 'Zariyah (Arabic)', shortName: 'Zariyah', gender: 'Female', locale: 'ar-SA', friendlyLocale: 'Arabic', persona: 'Crisp Arabic narrator', tags: 'arabic female global', group: 'Global AI' }
];

module.exports = {
  APP_NAME,
  APP_VERSION,
  DEFAULT_PORT,
  FALLBACK_PORTS,
  UDP_DISCOVERY_PORT,
  MDNS_SERVICE_TYPE,
  MDNS_LEGACY_SERVICE_TYPE,
  MAX_REDOS_INPUT_LENGTH,
  NETWORK_CHANGE_CHECK_INTERVAL_MS,
  ANDROID_HEARTBEAT_INTERVAL_MS,
  OBS_HEARTBEAT_INTERVAL_MS,
  DISCORD_URL,
  WEBSITE_URL,
  GITHUB_REPO_URL,
  getDefaultAppDataDir,
  EDGE_TRUSTED_CLIENT_TOKEN,
  WIN_EPOCH,
  EDGE_TTS_VOICES_URL,
  EDGE_TTS_WS_URL_BASE,
  EDGE_TTS_TIMEOUT_MS,
  EDGE_VOICE_CACHE_TTL_MS,
  GOOGLE_TTS_URL,
  DEFAULT_TTS_VOICE,
  FALLBACK_EDGE_VOICES
};
