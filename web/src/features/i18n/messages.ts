// Telugu and Hindi texts are machine translations awaiting review by a native speaker (DEC-023).
import * as account from "./areas/account";
import * as agent from "./areas/agent";
import * as care from "./areas/care";
import * as chat from "./areas/chat";
import * as community from "./areas/community";
import * as data from "./areas/data";
import * as documents from "./areas/documents";
import * as events from "./areas/events";
import * as home from "./areas/home";
import * as inbox from "./areas/inbox";
import * as reminders from "./areas/reminders";
import * as search from "./areas/search";
import * as spaces from "./areas/spaces";
import * as tasks from "./areas/tasks";

export const LANGUAGES = ["en", "te", "hi"] as const;
export type Language = (typeof LANGUAGES)[number];

export const languageLabels: Record<Language, string> = {
  en: "English", te: "తెలుగు", hi: "हिन्दी",
};

// The shell, navigation and account-entry texts (T70). Each screen area keeps its own texts in ./areas (T98).
const coreEn = {
  "language.label": "Language",
  "shell.brandCommunity": "Community",
  "shell.brandPlatform": "Platform",
  "shell.home": "Community Platform home",
  "shell.environment": "Local test environment",
  "shell.discover": "Discover pages",
  "shell.search": "Search",
  "shell.agent": "Agent",
  "shell.testInbox": "Test inbox",
  "shell.accountAccess": "Account access",
  "shell.localBuild": "Community Platform / Local build",
  "shell.inbox": "Notification inbox",
  "shell.inboxUnread": "Notification inbox, {count} unread",
  "nav.main": "Main",
  "nav.home": "Home",
  "nav.spaces": "Spaces",
  "nav.messages": "Messages",
  "nav.discover": "Discover",
  "nav.profile": "Profile",
  "auth.yourAccount": "YOUR ACCOUNT",
  "auth.welcome": "Welcome back",
  "auth.createHeading": "Create your account",
  "auth.recoverHeading": "Recover your account",
  "auth.completeHeading": "Complete your account",
  "auth.choosePassword": "Choose a new password",
  "auth.signInHint": "Sign in to Community Platform.",
  "auth.syntheticHint": "Synthetic .test accounts only.",
  "auth.signIn": "Sign in",
  "auth.createAccount": "Create account",
  "auth.email": "Email address",
  "auth.emailVerification": "Email verification",
  "auth.codeRequested": "Code requested",
  "auth.code": "Verification code",
  "auth.displayName": "Display name",
  "auth.password": "Password",
  "auth.newPassword": "New password",
  "auth.hidePassword": "Hide password",
  "auth.showPassword": "Show password",
  "auth.passwordHint": "12 to 128 characters",
  "auth.timezone": "Timezone",
  "auth.timezoneProblem": "The list of timezones did not load, so yours may be missing.",
  "auth.retry": "Retry",
  "auth.wait": "Please wait",
  "auth.verifyCreate": "Verify and create account",
  "auth.changePassword": "Change password",
  "auth.sendCode": "Send verification code",
  "auth.forgotPassword": "Forgot your password?",
  "auth.newCode": "Request a new code",
  "auth.backSignIn": "Back to sign in",
  "auth.passwordChanged": "Password changed. All previous sessions are signed out.",
  "auth.deletionPending": "This account is waiting to be deleted on {date}. Cancel the deletion to keep your account and sign in.",
  "auth.cancelDeletion": "Cancel deletion and sign in",
  "auth.error.email": "Enter a valid email address.",
  "auth.error.syntheticEmail": "Use a synthetic .test address in this local build.",
  "auth.error.password": "Enter your password.",
  "auth.error.code": "Enter the six-digit code.",
  "auth.error.passwordLength": "Use 12 to 128 characters.",
  "auth.error.displayName": "Enter a display name.",
  "auth.error.displayNameLength": "Use up to {limit} characters.",
} as const;

export type MessageValues = Readonly<Record<string, string | number>>;

const coreTe: Partial<Record<keyof typeof coreEn, string>> = {
  "language.label": "భాష",
  "shell.home": "Community Platform హోమ్",
  "shell.environment": "లోకల్ పరీక్షా వాతావరణం",
  "shell.discover": "పేజీలను కనుగొనండి",
  "shell.search": "వెతకండి",
  "shell.agent": "ఏజెంట్",
  "shell.testInbox": "పరీక్షా ఇన్‌బాక్స్",
  "shell.accountAccess": "ఖాతా యాక్సెస్",
  "shell.localBuild": "Community Platform / లోకల్ బిల్డ్",
  "shell.inbox": "నోటిఫికేషన్ ఇన్‌బాక్స్",
  "shell.inboxUnread": "నోటిఫికేషన్ ఇన్‌బాక్స్, చదవనివి {count}",
  "nav.main": "ప్రధాన",
  "nav.home": "హోమ్",
  "nav.spaces": "స్పేస్‌లు",
  "nav.messages": "సందేశాలు",
  "nav.discover": "కనుగొనండి",
  "nav.profile": "ప్రొఫైల్",
  "auth.yourAccount": "మీ ఖాతా",
  "auth.welcome": "మళ్లీ స్వాగతం",
  "auth.createHeading": "మీ ఖాతాను సృష్టించండి",
  "auth.recoverHeading": "మీ ఖాతాను తిరిగి పొందండి",
  "auth.completeHeading": "మీ ఖాతాను పూర్తి చేయండి",
  "auth.choosePassword": "కొత్త పాస్‌వర్డ్ ఎంచుకోండి",
  "auth.signInHint": "Community Platform లో సైన్ ఇన్ చేయండి.",
  "auth.syntheticHint": "పరీక్ష కోసం కల్పించిన .test ఖాతాలు మాత్రమే.",
  "auth.signIn": "సైన్ ఇన్",
  "auth.createAccount": "ఖాతా సృష్టించండి",
  "auth.email": "ఇమెయిల్ చిరునామా",
  "auth.emailVerification": "ఇమెయిల్ ధృవీకరణ",
  "auth.codeRequested": "కోడ్ కోరబడింది",
  "auth.code": "ధృవీకరణ కోడ్",
  "auth.displayName": "కనిపించే పేరు",
  "auth.password": "పాస్‌వర్డ్",
  "auth.newPassword": "కొత్త పాస్‌వర్డ్",
  "auth.hidePassword": "పాస్‌వర్డ్ దాచండి",
  "auth.showPassword": "పాస్‌వర్డ్ చూపించండి",
  "auth.passwordHint": "12 నుంచి 128 అక్షరాలు",
  "auth.timezone": "టైమ్ జోన్",
  "auth.timezoneProblem": "టైమ్ జోన్‌ల జాబితా లోడ్ కాలేదు. మీ టైమ్ జోన్ లేకపోవచ్చు.",
  "auth.retry": "మళ్లీ ప్రయత్నించండి",
  "auth.wait": "దయచేసి వేచి ఉండండి",
  "auth.verifyCreate": "ధృవీకరించి ఖాతా సృష్టించండి",
  "auth.changePassword": "పాస్‌వర్డ్ మార్చండి",
  "auth.sendCode": "ధృవీకరణ కోడ్ పంపండి",
  "auth.forgotPassword": "పాస్‌వర్డ్ మర్చిపోయారా?",
  "auth.newCode": "కొత్త కోడ్ కోరండి",
  "auth.backSignIn": "సైన్ ఇన్‌కు వెళ్లండి",
  "auth.passwordChanged": "పాస్‌వర్డ్ మారింది. మునుపటి సెషన్‌లన్నీ సైన్ అవుట్ అయ్యాయి.",
  "auth.deletionPending": "ఈ ఖాతా {date} నాడు తొలగించబడటానికి వేచి ఉంది. ఖాతాను ఉంచుకుని సైన్ ఇన్ చేయడానికి తొలగింపును రద్దు చేయండి.",
  "auth.cancelDeletion": "తొలగింపును రద్దు చేసి సైన్ ఇన్ చేయండి",
  "auth.error.email": "సరైన ఇమెయిల్ చిరునామా నమోదు చేయండి.",
  "auth.error.syntheticEmail": "ఈ లోకల్ బిల్డ్‌లో పరీక్ష కోసం కల్పించిన .test చిరునామాను ఉపయోగించండి.",
  "auth.error.password": "మీ పాస్‌వర్డ్ నమోదు చేయండి.",
  "auth.error.code": "ఆరు అంకెల కోడ్ నమోదు చేయండి.",
  "auth.error.passwordLength": "12 నుంచి 128 అక్షరాలు ఉపయోగించండి.",
  "auth.error.displayName": "కనిపించే పేరు నమోదు చేయండి.",
  "auth.error.displayNameLength": "{limit} అక్షరాల వరకు ఉపయోగించండి.",
};

const coreHi: Partial<Record<keyof typeof coreEn, string>> = {
  "language.label": "भाषा",
  "shell.home": "Community Platform होम",
  "shell.environment": "लोकल टेस्ट माहौल",
  "shell.discover": "पेज खोजें",
  "shell.search": "खोजें",
  "shell.agent": "एजेंट",
  "shell.testInbox": "टेस्ट इनबॉक्स",
  "shell.accountAccess": "अकाउंट तक पहुँच",
  "shell.localBuild": "Community Platform / लोकल बिल्ड",
  "shell.inbox": "नोटिफ़िकेशन इनबॉक्स",
  "shell.inboxUnread": "नोटिफ़िकेशन इनबॉक्स, {count} अपठित",
  "nav.main": "मुख्य",
  "nav.home": "होम",
  "nav.spaces": "स्पेस",
  "nav.messages": "मैसेज",
  "nav.discover": "खोजें",
  "nav.profile": "प्रोफ़ाइल",
  "auth.yourAccount": "आपका अकाउंट",
  "auth.welcome": "फिर से स्वागत है",
  "auth.createHeading": "अपना अकाउंट बनाएँ",
  "auth.recoverHeading": "अपना अकाउंट वापस पाएँ",
  "auth.completeHeading": "अपना अकाउंट पूरा करें",
  "auth.choosePassword": "नया पासवर्ड चुनें",
  "auth.signInHint": "Community Platform में साइन इन करें।",
  "auth.syntheticHint": "केवल टेस्ट के लिए बनाए गए .test अकाउंट।",
  "auth.signIn": "साइन इन",
  "auth.createAccount": "अकाउंट बनाएँ",
  "auth.email": "ईमेल पता",
  "auth.emailVerification": "ईमेल वेरिफ़िकेशन",
  "auth.codeRequested": "कोड का अनुरोध किया गया",
  "auth.code": "वेरिफ़िकेशन कोड",
  "auth.displayName": "दिखने वाला नाम",
  "auth.password": "पासवर्ड",
  "auth.newPassword": "नया पासवर्ड",
  "auth.hidePassword": "पासवर्ड छिपाएँ",
  "auth.showPassword": "पासवर्ड दिखाएँ",
  "auth.passwordHint": "12 से 128 अक्षर",
  "auth.timezone": "टाइम ज़ोन",
  "auth.timezoneProblem": "टाइम ज़ोन की सूची लोड नहीं हुई। आपका टाइम ज़ोन छूटा हो सकता है।",
  "auth.retry": "फिर कोशिश करें",
  "auth.wait": "कृपया इंतज़ार करें",
  "auth.verifyCreate": "जाँचकर अकाउंट बनाएँ",
  "auth.changePassword": "पासवर्ड बदलें",
  "auth.sendCode": "वेरिफ़िकेशन कोड भेजें",
  "auth.forgotPassword": "पासवर्ड भूल गए?",
  "auth.newCode": "नया कोड माँगें",
  "auth.backSignIn": "साइन-इन पर लौटें",
  "auth.passwordChanged": "पासवर्ड बदल गया। सभी पुराने सेशन साइन आउट हो गए हैं।",
  "auth.deletionPending": "यह अकाउंट {date} को मिटाने के इंतज़ार में है। अकाउंट रखने और साइन इन करने के लिए मिटाने का अनुरोध रद्द करें।",
  "auth.cancelDeletion": "मिटाना रद्द करके साइन इन करें",
  "auth.error.email": "सही ईमेल पता दर्ज करें।",
  "auth.error.syntheticEmail": "इस लोकल बिल्ड में टेस्ट के लिए बनाया गया .test पता इस्तेमाल करें।",
  "auth.error.password": "अपना पासवर्ड दर्ज करें।",
  "auth.error.code": "छह अंकों का कोड दर्ज करें।",
  "auth.error.passwordLength": "12 से 128 अक्षर इस्तेमाल करें।",
  "auth.error.displayName": "दिखने वाला नाम दर्ज करें।",
  "auth.error.displayNameLength": "{limit} अक्षरों तक इस्तेमाल करें।",
};

// The areas, in this order. An id defined twice would let the later one win silently, so a test refuses duplicates.
export const core = { en: coreEn, te: coreTe, hi: coreHi };
export const areas = { account, agent, care, chat, community, data, documents, events, home, inbox, reminders, search, spaces, tasks };

export const en = {
  ...coreEn, ...account.en, ...agent.en, ...care.en, ...chat.en, ...community.en, ...data.en, ...documents.en,
  ...events.en, ...home.en, ...inbox.en, ...reminders.en, ...search.en, ...spaces.en, ...tasks.en,
};

export type MessageId = keyof typeof en;

export const te: Partial<Record<MessageId, string>> = {
  ...coreTe, ...account.te, ...agent.te, ...care.te, ...chat.te, ...community.te, ...data.te, ...documents.te,
  ...events.te, ...home.te, ...inbox.te, ...reminders.te, ...search.te, ...spaces.te, ...tasks.te,
};

export const hi: Partial<Record<MessageId, string>> = {
  ...coreHi, ...account.hi, ...agent.hi, ...care.hi, ...chat.hi, ...community.hi, ...data.hi, ...documents.hi,
  ...events.hi, ...home.hi, ...inbox.hi, ...reminders.hi, ...search.hi, ...spaces.hi, ...tasks.hi,
};

export const dictionaries = { en, te, hi };

export function isLanguage(value: unknown): value is Language {
  return LANGUAGES.some(language => language === value);
}

export function translate(language: Language, id: MessageId, values: MessageValues = {}): string {
  const template = dictionaries[language][id] ?? en[id];
  return template.replace(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g, (placeholder, name: string) =>
    Object.hasOwn(values, name) ? String(values[name]) : placeholder);
}