"""Shared vocabulary, page classification and people's chosen interests (DEC-027, T126 and T127).

One vocabulary classifies pages and describes what a person chooses to be interested in. Telugu and Hindi names are
machine drafts until a native speaker reviews them (DEC-023). Terms are data, so later ones are added without a release.
"""

from alembic import op
import sqlalchemy as sa

revision = "0032"
down_revision = "0031"
branch_labels = None
depends_on = None

DIMENSIONS = ("topic", "interest", "language", "place", "community_type", "audience", "activity", "content_kind")
PAGE_DIMENSIONS = DIMENSIONS
INTEREST_DIMENSIONS = ("topic", "interest", "language", "place")
LEGACY_TOPICS = ("community", "education", "health", "local", "family", "events", "hobbies", "support", "news", "other")


def listed(values):
    return ", ".join(f"'{value}'" for value in values)


# (code, English, Telugu, Hindi, sensitive). The first ten existing topics keep the names the web already shows.
TOPICS = [
    ("technology", "Technology", "సాంకేతికత", "प्रौद्योगिकी", False),
    ("education", "Education", "విద్య", "शिक्षा", False),
    ("business", "Business and careers", "వ్యాపారం మరియు ఉద్యోగాలు", "व्यापार और करियर", False),
    ("science", "Science", "విజ్ఞానం", "विज्ञान", False),
    ("health", "Health", "ఆరోగ్యం", "स्वास्थ्य", True),
    ("family", "Family", "కుటుంబం", "परिवार", False),
    ("sports", "Sports and fitness", "క్రీడలు మరియు ఫిట్‌నెస్", "खेल और फ़िटनेस", False),
    ("entertainment", "Entertainment", "వినోదం", "मनोरंजन", False),
    ("culture", "Arts, culture and festivals", "కళలు, సంస్కృతి మరియు పండుగలు", "कला, संस्कृति और त्योहार", False),
    ("food", "Food and cooking", "ఆహారం మరియు వంట", "खाना और पकवान", False),
    ("travel", "Travel", "ప్రయాణం", "यात्रा", False),
    ("lifestyle", "Lifestyle", "జీవనశైలి", "जीवनशैली", False),
    ("environment", "Environment and gardening", "పర్యావరణం మరియు తోటపని", "पर्यावरण और बागवानी", False),
    ("news", "News", "వార్తలు", "समाचार", False),
    ("local", "Local", "స్థానికం", "स्थानीय", False),
    ("events", "Events", "ఈవెంట్‌లు", "इवेंट", False),
    ("hobbies", "Hobbies", "అభిరుచులు", "शौक", False),
    ("support", "Support", "సహాయం", "सहायता", True),
    ("community", "Community", "కమ్యూనిటీ", "समुदाय", False),
    ("other", "Other", "ఇతరాలు", "अन्य", False),
]

# (topic, code, English, Telugu, Hindi, sensitive)
INTERESTS = [
    ("technology", "ai", "Artificial intelligence", "కృత్రిమ మేధ", "कृत्रिम बुद्धिमत्ता", False),
    ("technology", "software", "Software development", "సాఫ్ట్‌వేర్ అభివృద్ధి", "सॉफ़्टवेयर विकास", False),
    ("technology", "cybersecurity", "Cybersecurity", "సైబర్ భద్రత", "साइबर सुरक्षा", False),
    ("technology", "robotics", "Robotics", "రోబోటిక్స్", "रोबोटिक्स", False),
    ("technology", "cloud", "Cloud computing", "క్లౌడ్ కంప్యూటింగ్", "क्लाउड कंप्यूटिंग", False),
    ("technology", "gadgets", "Gadgets", "గ్యాడ్జెట్‌లు", "गैजेट", False),
    ("education", "school", "School", "పాఠశాల", "स्कूल", False),
    ("education", "university", "University", "విశ్వవిద్యాలయం", "विश्वविद्यालय", False),
    ("education", "exams", "Exam preparation", "పరీక్షల సన్నద్ధత", "परीक्षा की तैयारी", False),
    ("education", "research", "Research", "పరిశోధన", "अनुसंधान", False),
    ("education", "language-learning", "Language learning", "భాషల అభ్యాసం", "भाषा सीखना", False),
    ("business", "startups", "Startups", "స్టార్టప్‌లు", "स्टार्टअप", False),
    ("business", "entrepreneurship", "Entrepreneurship", "వ్యవస్థాపకత", "उद्यमिता", False),
    ("business", "personal-finance", "Personal finance", "వ్యక్తిగత ఆర్థికం", "निजी वित्त", False),
    ("business", "careers", "Careers and jobs", "కెరీర్ మరియు ఉద్యోగాలు", "करियर और नौकरियाँ", False),
    ("business", "management", "Management", "నిర్వహణ", "प्रबंधन", False),
    ("science", "physics", "Physics", "భౌతిక శాస్త్రం", "भौतिकी", False),
    ("science", "biology", "Biology", "జీవశాస్త్రం", "जीव विज्ञान", False),
    ("science", "mathematics", "Mathematics", "గణితం", "गणित", False),
    ("science", "astronomy", "Astronomy", "ఖగోళశాస్త్రం", "खगोल विज्ञान", False),
    ("science", "engineering", "Engineering", "ఇంజినీరింగ్", "इंजीनियरिंग", False),
    ("health", "nutrition", "Nutrition", "పోషణ", "पोषण", True),
    ("health", "mental-health", "Mental health", "మానసిక ఆరోగ్యం", "मानसिक स्वास्थ्य", True),
    ("health", "caregiving", "Caregiving", "సంరక్షణ", "देखभाल", True),
    ("family", "parenting", "Parenting", "పిల్లల పెంపకం", "पालन-पोषण", False),
    ("family", "family-activities", "Family activities", "కుటుంబ కార్యక్రమాలు", "पारिवारिक गतिविधियाँ", False),
    ("family", "elder-care", "Elder care", "వృద్ధుల సంరక్షణ", "बुज़ुर्गों की देखभाल", True),
    ("sports", "cricket", "Cricket", "క్రికెట్", "क्रिकेट", False),
    ("sports", "football", "Football", "ఫుట్‌బాల్", "फ़ुटबॉल", False),
    ("sports", "basketball", "Basketball", "బాస్కెట్‌బాల్", "बास्केटबॉल", False),
    ("sports", "badminton", "Badminton", "బ్యాడ్మింటన్", "बैडमिंटन", False),
    ("sports", "fitness", "Fitness", "ఫిట్‌నెస్", "फ़िटनेस", False),
    ("sports", "yoga", "Yoga", "యోగా", "योग", False),
    ("sports", "running", "Running", "పరుగు", "दौड़", False),
    ("sports", "esports", "Esports", "ఈ-స్పోర్ట్స్", "ई-स्पोर्ट्स", False),
    ("entertainment", "movies", "Movies", "సినిమాలు", "फ़िल्में", False),
    ("entertainment", "music", "Music", "సంగీతం", "संगीत", False),
    ("entertainment", "television", "Television", "టెలివిజన్", "टेलीविज़न", False),
    ("entertainment", "gaming", "Gaming", "గేమింగ్", "गेमिंग", False),
    ("entertainment", "creators", "Creators", "క్రియేటర్‌లు", "क्रिएटर", False),
    ("culture", "festivals", "Festivals", "పండుగలు", "त्योहार", False),
    ("culture", "dance", "Dance", "నృత్యం", "नृत्य", False),
    ("culture", "art", "Art and painting", "కళ మరియు చిత్రలేఖనం", "कला और चित्रकारी", False),
    ("culture", "literature", "Books and literature", "పుస్తకాలు మరియు సాహిత్యం", "किताबें और साहित्य", False),
    ("culture", "handicrafts", "Handicrafts", "హస్తకళలు", "हस्तशिल्प", False),
    ("food", "cooking", "Cooking", "వంట", "खाना बनाना", False),
    ("food", "baking", "Baking", "బేకింగ్", "बेकिंग", False),
    ("food", "vegetarian", "Vegetarian food", "శాకాహారం", "शाकाहारी भोजन", False),
    ("food", "street-food", "Street food", "వీధి ఆహారం", "स्ट्रीट फ़ूड", False),
    ("travel", "trekking", "Trekking and hiking", "ట్రెక్కింగ్", "ट्रेकिंग", False),
    ("travel", "budget-travel", "Budget travel", "తక్కువ ఖర్చు ప్రయాణం", "बजट यात्रा", False),
    ("travel", "heritage", "Heritage places", "వారసత్వ ప్రదేశాలు", "विरासत स्थल", False),
    ("lifestyle", "fashion", "Fashion", "ఫ్యాషన్", "फ़ैशन", False),
    ("lifestyle", "wellness", "Wellness", "శ్రేయస్సు", "वेलनेस", False),
    ("lifestyle", "photography", "Photography", "ఫోటోగ్రఫీ", "फ़ोटोग्राफ़ी", False),
    ("lifestyle", "home-decor", "Home and decor", "ఇల్లు మరియు అలంకరణ", "घर और सजावट", False),
    ("environment", "gardening", "Gardening", "తోటపని", "बागवानी", False),
    ("environment", "urban-farming", "Urban farming", "పట్టణ వ్యవసాయం", "शहरी खेती", False),
    ("environment", "composting", "Composting", "కంపోస్టింగ్", "कंपोस्टिंग", False),
    ("environment", "soil-health", "Soil health", "నేల ఆరోగ్యం", "मिट्टी की सेहत", False),
    ("environment", "sustainability", "Sustainable living", "సుస్థిర జీవనం", "टिकाऊ जीवनशैली", False),
    ("environment", "wildlife", "Wildlife", "వన్యప్రాణులు", "वन्यजीव", False),
    ("environment", "climate", "Climate", "వాతావరణం", "जलवायु", False),
    ("news", "local-news", "Local news", "స్థానిక వార్తలు", "स्थानीय समाचार", False),
    ("news", "world-news", "World news", "ప్రపంచ వార్తలు", "विश्व समाचार", False),
    ("news", "science-news", "Science news", "విజ్ఞాన వార్తలు", "विज्ञान समाचार", False),
    ("news", "tech-news", "Technology news", "సాంకేతిక వార్తలు", "तकनीकी समाचार", False),
    ("news", "business-news", "Business news", "వ్యాపార వార్తలు", "व्यापार समाचार", False),
    ("local", "local-services", "Local services", "స్థానిక సేవలు", "स्थानीय सेवाएँ", False),
    ("local", "neighbourhood", "Neighbourhood", "పరిసర ప్రాంతం", "पड़ोस", False),
    ("local", "volunteering", "Volunteering", "స్వచ్ఛంద సేవ", "स्वयंसेवा", False),
    ("events", "meetups", "Meetups", "సమావేశాలు", "मीटअप", False),
    ("events", "workshops", "Workshops", "వర్క్‌షాప్‌లు", "कार्यशालाएँ", False),
    ("events", "concerts", "Concerts", "సంగీత కచేరీలు", "संगीत कार्यक्रम", False),
    ("hobbies", "pets", "Pets", "పెంపుడు జంతువులు", "पालतू जानवर", False),
    ("hobbies", "diy", "Do it yourself", "మీరే చేయండి", "खुद बनाएँ", False),
    ("hobbies", "board-games", "Board games", "బోర్డ్ ఆటలు", "बोर्ड गेम", False),
    ("support", "peer-support", "Peer support", "తోటివారి మద్దతు", "साथियों का सहारा", True),
    ("community", "social-causes", "Social causes", "సామాజిక కార్యక్రమాలు", "सामाजिक मुद्दे", False),
]

# Languages, by ISO 639 code: the 22 scheduled languages of India, English and eight widely spoken others.
LANGUAGES = [
    ("en", "English", "ఇంగ్లీష్", "अंग्रेज़ी"),
    ("hi", "Hindi", "హిందీ", "हिन्दी"),
    ("te", "Telugu", "తెలుగు", "तेलुगु"),
    ("ta", "Tamil", "తమిళం", "तमिल"),
    ("kn", "Kannada", "కన్నడ", "कन्नड़"),
    ("ml", "Malayalam", "మలయాళం", "मलयालम"),
    ("mr", "Marathi", "మరాఠీ", "मराठी"),
    ("bn", "Bengali", "బెంగాలీ", "बांग्ला"),
    ("gu", "Gujarati", "గుజరాతీ", "गुजराती"),
    ("pa", "Punjabi", "పంజాబీ", "पंजाबी"),
    ("or", "Odia", "ఒడియా", "ओड़िया"),
    ("as", "Assamese", "అస్సామీ", "असमिया"),
    ("ur", "Urdu", "ఉర్దూ", "उर्दू"),
    ("sa", "Sanskrit", "సంస్కృతం", "संस्कृत"),
    ("ks", "Kashmiri", "కాశ్మీరీ", "कश्मीरी"),
    ("sd", "Sindhi", "సింధీ", "सिंधी"),
    ("ne", "Nepali", "నేపాలీ", "नेपाली"),
    ("kok", "Konkani", "కొంకణి", "कोंकणी"),
    ("mai", "Maithili", "మైథిలి", "मैथिली"),
    ("mni", "Manipuri", "మణిపురి", "मणिपुरी"),
    ("brx", "Bodo", "బోడో", "बोडो"),
    ("doi", "Dogri", "డోగ్రీ", "डोगरी"),
    ("sat", "Santali", "సంతాలీ", "संथाली"),
    ("ar", "Arabic", "అరబిక్", "अरबी"),
    ("zh", "Chinese", "చైనీస్", "चीनी"),
    ("fr", "French", "ఫ్రెంచ్", "फ़्रेंच"),
    ("de", "German", "జర్మన్", "जर्मन"),
    ("es", "Spanish", "స్పానిష్", "स्पेनिश"),
    ("ja", "Japanese", "జపనీస్", "जापानी"),
    ("ru", "Russian", "రష్యన్", "रूसी"),
    ("pt", "Portuguese", "పోర్చుగీస్", "पुर्तगाली"),
]

# Countries by ISO 3166 code. India comes first; its states, union territories and main cities follow.
COUNTRIES = [
    ("in", "India", "భారతదేశం", "भारत"),
    ("ae", "United Arab Emirates", "యునైటెడ్ అరబ్ ఎమిరేట్స్", "संयुक्त अरब अमीरात"),
    ("au", "Australia", "ఆస్ట్రేలియా", "ऑस्ट्रेलिया"),
    ("bd", "Bangladesh", "బంగ్లాదేశ్", "बांग्लादेश"),
    ("br", "Brazil", "బ్రెజిల్", "ब्राज़ील"),
    ("bt", "Bhutan", "భూటాన్", "भूटान"),
    ("ca", "Canada", "కెనడా", "कनाडा"),
    ("cn", "China", "చైనా", "चीन"),
    ("de", "Germany", "జర్మనీ", "जर्मनी"),
    ("eg", "Egypt", "ఈజిప్ట్", "मिस्र"),
    ("es", "Spain", "స్పెయిన్", "स्पेन"),
    ("fj", "Fiji", "ఫిజీ", "फ़िजी"),
    ("fr", "France", "ఫ్రాన్స్", "फ़्रांस"),
    ("gb", "United Kingdom", "యునైటెడ్ కింగ్‌డమ్", "यूनाइटेड किंगडम"),
    ("id", "Indonesia", "ఇండోనేషియా", "इंडोनेशिया"),
    ("ie", "Ireland", "ఐర్లాండ్", "आयरलैंड"),
    ("it", "Italy", "ఇటలీ", "इटली"),
    ("jp", "Japan", "జపాన్", "जापान"),
    ("ke", "Kenya", "కెన్యా", "केन्या"),
    ("kr", "South Korea", "దక్షిణ కొరియా", "दक्षिण कोरिया"),
    ("kw", "Kuwait", "కువైట్", "कुवैत"),
    ("lk", "Sri Lanka", "శ్రీలంక", "श्रीलंका"),
    ("mu", "Mauritius", "మారిషస్", "मॉरीशस"),
    ("mv", "Maldives", "మాల్దీవులు", "मालदीव"),
    ("mx", "Mexico", "మెక్సికో", "मेक्सिको"),
    ("my", "Malaysia", "మలేషియా", "मलेशिया"),
    ("ng", "Nigeria", "నైజీరియా", "नाइजीरिया"),
    ("nl", "Netherlands", "నెదర్లాండ్స్", "नीदरलैंड"),
    ("np", "Nepal", "నేపాల్", "नेपाल"),
    ("nz", "New Zealand", "న్యూజిలాండ్", "न्यूज़ीलैंड"),
    ("om", "Oman", "ఒమన్", "ओमान"),
    ("pk", "Pakistan", "పాకిస్తాన్", "पाकिस्तान"),
    ("qa", "Qatar", "ఖతార్", "क़तर"),
    ("ru", "Russia", "రష్యా", "रूस"),
    ("sa", "Saudi Arabia", "సౌదీ అరేబియా", "सऊदी अरब"),
    ("sg", "Singapore", "సింగపూర్", "सिंगापुर"),
    ("th", "Thailand", "థాయ్‌లాండ్", "थाईलैंड"),
    ("us", "United States", "అమెరికా సంయుక్త రాష్ట్రాలు", "संयुक्त राज्य अमेरिका"),
    ("za", "South Africa", "దక్షిణాఫ్రికా", "दक्षिण अफ़्रीका"),
]

# India's 28 states and 8 union territories: (slug, English, Telugu, Hindi).
INDIAN_REGIONS = [
    ("andhra-pradesh", "Andhra Pradesh", "ఆంధ్రప్రదేశ్", "आंध्र प्रदेश"),
    ("arunachal-pradesh", "Arunachal Pradesh", "అరుణాచల్ ప్రదేశ్", "अरुणाचल प्रदेश"),
    ("assam", "Assam", "అస్సాం", "असम"),
    ("bihar", "Bihar", "బీహార్", "बिहार"),
    ("chhattisgarh", "Chhattisgarh", "ఛత్తీస్‌గఢ్", "छत्तीसगढ़"),
    ("goa", "Goa", "గోవా", "गोवा"),
    ("gujarat", "Gujarat", "గుజరాత్", "गुजरात"),
    ("haryana", "Haryana", "హర్యానా", "हरियाणा"),
    ("himachal-pradesh", "Himachal Pradesh", "హిమాచల్ ప్రదేశ్", "हिमाचल प्रदेश"),
    ("jharkhand", "Jharkhand", "జార్ఖండ్", "झारखंड"),
    ("karnataka", "Karnataka", "కర్ణాటక", "कर्नाटक"),
    ("kerala", "Kerala", "కేరళ", "केरल"),
    ("madhya-pradesh", "Madhya Pradesh", "మధ్యప్రదేశ్", "मध्य प्रदेश"),
    ("maharashtra", "Maharashtra", "మహారాష్ట్ర", "महाराष्ट्र"),
    ("manipur", "Manipur", "మణిపూర్", "मणिपुर"),
    ("meghalaya", "Meghalaya", "మేఘాలయ", "मेघालय"),
    ("mizoram", "Mizoram", "మిజోరాం", "मिज़ोरम"),
    ("nagaland", "Nagaland", "నాగాలాండ్", "नागालैंड"),
    ("odisha", "Odisha", "ఒడిశా", "ओडिशा"),
    ("punjab", "Punjab", "పంజాబ్", "पंजाब"),
    ("rajasthan", "Rajasthan", "రాజస్థాన్", "राजस्थान"),
    ("sikkim", "Sikkim", "సిక్కిం", "सिक्किम"),
    ("tamil-nadu", "Tamil Nadu", "తమిళనాడు", "तमिलनाडु"),
    ("telangana", "Telangana", "తెలంగాణ", "तेलंगाना"),
    ("tripura", "Tripura", "త్రిపుర", "त्रिपुरा"),
    ("uttar-pradesh", "Uttar Pradesh", "ఉత్తర ప్రదేశ్", "उत्तर प्रदेश"),
    ("uttarakhand", "Uttarakhand", "ఉత్తరాఖండ్", "उत्तराखंड"),
    ("west-bengal", "West Bengal", "పశ్చిమ బెంగాల్", "पश्चिम बंगाल"),
    ("andaman-nicobar", "Andaman and Nicobar Islands", "అండమాన్ నికోబార్ దీవులు", "अंडमान और निकोबार द्वीपसमूह"),
    ("chandigarh", "Chandigarh", "చండీగఢ్", "चंडीगढ़"),
    ("dadra-nagar-haveli-daman-diu", "Dadra and Nagar Haveli and Daman and Diu", "దాద్రా నగర్ హవేలీ మరియు డామన్ డయ్యూ", "दादरा और नगर हवेली और दमन और दीव"),
    ("delhi", "Delhi", "ఢిల్లీ", "दिल्ली"),
    ("jammu-kashmir", "Jammu and Kashmir", "జమ్మూ కాశ్మీర్", "जम्मू और कश्मीर"),
    ("ladakh", "Ladakh", "లడఖ్", "लद्दाख"),
    ("lakshadweep", "Lakshadweep", "లక్షద్వీప్", "लक्षद्वीप"),
    ("puducherry", "Puducherry", "పుదుచ్చేరి", "पुडुचेरी"),
]

# Main cities: (region slug, city slug, English, Telugu, Hindi).
INDIAN_CITIES = [
    ("telangana", "hyderabad", "Hyderabad", "హైదరాబాద్", "हैदराबाद"),
    ("telangana", "warangal", "Warangal", "వరంగల్", "वारंगल"),
    ("andhra-pradesh", "visakhapatnam", "Visakhapatnam", "విశాఖపట్నం", "विशाखापत्तनम"),
    ("andhra-pradesh", "vijayawada", "Vijayawada", "విజయవాడ", "विजयवाड़ा"),
    ("andhra-pradesh", "tirupati", "Tirupati", "తిరుపతి", "तिरुपति"),
    ("karnataka", "bengaluru", "Bengaluru", "బెంగళూరు", "बेंगलुरु"),
    ("karnataka", "mysuru", "Mysuru", "మైసూరు", "मैसूरु"),
    ("tamil-nadu", "chennai", "Chennai", "చెన్నై", "चेन्नई"),
    ("tamil-nadu", "coimbatore", "Coimbatore", "కోయంబత్తూరు", "कोयंबटूर"),
    ("tamil-nadu", "madurai", "Madurai", "మదురై", "मदुरै"),
    ("maharashtra", "mumbai", "Mumbai", "ముంబై", "मुंबई"),
    ("maharashtra", "pune", "Pune", "పుణె", "पुणे"),
    ("maharashtra", "nagpur", "Nagpur", "నాగ్‌పూర్", "नागपुर"),
    ("delhi", "new-delhi", "New Delhi", "న్యూఢిల్లీ", "नई दिल्ली"),
    ("west-bengal", "kolkata", "Kolkata", "కోల్‌కతా", "कोलकाता"),
    ("gujarat", "ahmedabad", "Ahmedabad", "అహ్మదాబాద్", "अहमदाबाद"),
    ("gujarat", "surat", "Surat", "సూరత్", "सूरत"),
    ("rajasthan", "jaipur", "Jaipur", "జైపూర్", "जयपुर"),
    ("uttar-pradesh", "lucknow", "Lucknow", "లక్నో", "लखनऊ"),
    ("uttar-pradesh", "varanasi", "Varanasi", "వారణాసి", "वाराणसी"),
    ("uttar-pradesh", "noida", "Noida", "నోయిడా", "नोएडा"),
    ("bihar", "patna", "Patna", "పాట్నా", "पटना"),
    ("madhya-pradesh", "bhopal", "Bhopal", "భోపాల్", "भोपाल"),
    ("madhya-pradesh", "indore", "Indore", "ఇండోర్", "इंदौर"),
    ("kerala", "kochi", "Kochi", "కొచ్చి", "कोच्चि"),
    ("kerala", "thiruvananthapuram", "Thiruvananthapuram", "తిరువనంతపురం", "तिरुवनंतपुरम"),
    ("odisha", "bhubaneswar", "Bhubaneswar", "భువనేశ్వర్", "भुवनेश्वर"),
    ("assam", "guwahati", "Guwahati", "గువాహటి", "गुवाहाटी"),
    ("haryana", "gurugram", "Gurugram", "గురుగ్రామ్", "गुरुग्राम"),
    ("punjab", "ludhiana", "Ludhiana", "లుధియానా", "लुधियाना"),
    ("punjab", "amritsar", "Amritsar", "అమృత్‌సర్", "अमृतसर"),
    ("jharkhand", "ranchi", "Ranchi", "రాంచీ", "रांची"),
    ("chhattisgarh", "raipur", "Raipur", "రాయ్‌పూర్", "रायपुर"),
    ("uttarakhand", "dehradun", "Dehradun", "డెహ్రాడూన్", "देहरादून"),
    ("goa", "panaji", "Panaji", "పనాజీ", "पणजी"),
]

# (dimension, code, English, Telugu, Hindi, sensitive)
SMALL_DIMENSIONS = [
    ("community_type", "family", "Family", "కుటుంబం", "परिवार", False),
    ("community_type", "professional", "Professional", "వృత్తిపరమైన", "पेशेवर", False),
    ("community_type", "hobby", "Hobby", "అభిరుచి", "शौक", False),
    ("community_type", "local", "Local", "స్థానిక", "स्थानीय", False),
    ("community_type", "learning", "Learning", "అభ్యాసం", "सीखना", False),
    ("community_type", "support-group", "Support group", "సహాయక బృందం", "सहायता समूह", True),
    ("community_type", "culture", "Culture", "సంస్కృతి", "संस्कृति", False),
    ("community_type", "organization", "Organization", "సంస్థ", "संगठन", False),
    ("community_type", "fans", "Fans", "అభిమానులు", "प्रशंसक", False),
    ("audience", "everyone", "Everyone", "అందరూ", "सभी", False),
    ("audience", "beginners", "Beginners", "ప్రారంభకులు", "शुरुआती", False),
    ("audience", "experts", "Experts", "నిపుణులు", "विशेषज्ञ", False),
    ("audience", "parents", "Parents", "తల్లిదండ్రులు", "माता-पिता", False),
    ("audience", "students", "Students", "విద్యార్థులు", "छात्र", False),
    ("audience", "professionals", "Working professionals", "ఉద్యోగులు", "कामकाजी लोग", False),
    ("audience", "seniors", "Seniors", "వృద్ధులు", "वरिष्ठ नागरिक", False),
    ("audience", "caregivers", "Caregivers", "సంరక్షకులు", "देखभाल करने वाले", True),
    ("activity", "learning", "Learning", "నేర్చుకోవడం", "सीखना", False),
    ("activity", "discussions", "Discussions", "చర్చలు", "चर्चाएँ", False),
    ("activity", "events", "Events", "ఈవెంట్‌లు", "इवेंट", False),
    ("activity", "support", "Support", "సహాయం", "सहायता", True),
    ("activity", "volunteering", "Volunteering", "స్వచ్ఛంద సేవ", "स्वयंसेवा", False),
    ("activity", "networking", "Networking", "పరిచయాలు", "नेटवर्किंग", False),
    ("activity", "sharing-tips", "Sharing tips", "చిట్కాలు పంచుకోవడం", "सुझाव साझा करना", False),
    ("content_kind", "discussions", "Discussions", "చర్చలు", "चर्चाएँ", False),
    ("content_kind", "tutorials", "Tutorials", "ట్యుటోరియల్స్", "ट्यूटोरियल", False),
    ("content_kind", "news", "News", "వార్తలు", "समाचार", False),
    ("content_kind", "videos", "Videos", "వీడియోలు", "वीडियो", False),
    ("content_kind", "photos", "Photos", "ఫోటోలు", "तस्वीरें", False),
    ("content_kind", "articles", "Articles", "వ్యాసాలు", "लेख", False),
    ("content_kind", "questions", "Questions and answers", "ప్రశ్నలు మరియు జవాబులు", "सवाल और जवाब", False),
]


def term(dimension, code, en, te, hi, order, sensitive=False, parent=None, path=None):
    return {
        "dimension": dimension, "code": code,
        "parent_dimension": parent[0] if parent else None, "parent_code": parent[1] if parent else None,
        "path": path or code, "sort_order": order, "sensitive": sensitive, "status": "active",
        "label_en": en, "label_te": te, "label_hi": hi,
    }


def place_rows():
    """Places in reading order: India, each state with its cities, then the other countries."""
    (code, en, te, hi), *others = COUNTRIES
    rows = [term("place", code, en, te, hi, 0)]
    for slug, en, te, hi in INDIAN_REGIONS:
        region = f"in-{slug}"
        rows.append(term("place", region, en, te, hi, len(rows), False, ("place", "in"), f"in/{region}"))
        for parent, city, city_en, city_te, city_hi in INDIAN_CITIES:
            if parent == slug:
                code = f"{region}-{city}"
                rows.append(term("place", code, city_en, city_te, city_hi, len(rows), False, ("place", region), f"in/{region}/{code}"))
    for code, en, te, hi in others:
        rows.append(term("place", code, en, te, hi, len(rows)))
    return rows


def seed_rows():
    """Rows in an order where every parent comes before its children."""
    topics = [term("topic", code, en, te, hi, order, sensitive) for order, (code, en, te, hi, sensitive) in enumerate(TOPICS)]
    interests = [
        term("interest", code, en, te, hi, order, sensitive, ("topic", topic), f"{topic}/{code}")
        for order, (topic, code, en, te, hi, sensitive) in enumerate(INTERESTS)
    ]
    languages = [term("language", code, en, te, hi, order) for order, (code, en, te, hi) in enumerate(LANGUAGES)]
    small = []
    for dimension, code, en, te, hi, sensitive in SMALL_DIMENSIONS:
        order = sum(1 for row in small if row["dimension"] == dimension)
        small.append(term(dimension, code, en, te, hi, order, sensitive))
    return [topics, interests, languages, place_rows(), small]


def upgrade():
    terms = op.create_table(
        "taxonomy_terms",
        sa.Column("dimension", sa.String(20), primary_key=True),
        sa.Column("code", sa.String(64), primary_key=True),
        sa.Column("parent_dimension", sa.String(20), nullable=True),
        sa.Column("parent_code", sa.String(64), nullable=True),
        sa.Column("path", sa.String(200), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("sensitive", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("status", sa.String(10), nullable=False, server_default="active"),
        sa.Column("label_en", sa.String(80), nullable=False),
        sa.Column("label_te", sa.String(120), nullable=True),
        sa.Column("label_hi", sa.String(120), nullable=True),
        sa.ForeignKeyConstraint(
            ["parent_dimension", "parent_code"], ["taxonomy_terms.dimension", "taxonomy_terms.code"], name="fk_taxonomy_term_parent",
        ),
        sa.CheckConstraint(f"dimension IN ({listed(DIMENSIONS)})", name="ck_taxonomy_term_dimension"),
        sa.CheckConstraint("code ~ '^[a-z0-9]+(-[a-z0-9]+)*$'", name="ck_taxonomy_term_code"),
        sa.CheckConstraint("status IN ('active', 'retired')", name="ck_taxonomy_term_status"),
        sa.CheckConstraint("char_length(label_en) > 0 AND char_length(path) > 0", name="ck_taxonomy_term_text"),
        # An interest sits under one topic; a place may sit inside another place; the other kinds stand alone.
        sa.CheckConstraint(
            "(dimension = 'interest' AND parent_dimension = 'topic' AND parent_code IS NOT NULL) OR "
            "(dimension = 'place' AND (parent_dimension IS NULL OR parent_dimension = 'place') "
            "AND (parent_dimension IS NULL) = (parent_code IS NULL)) OR "
            "(dimension NOT IN ('interest', 'place') AND parent_dimension IS NULL AND parent_code IS NULL)",
            name="ck_taxonomy_term_parent",
        ),
    )
    op.create_index("ix_taxonomy_term_order", "taxonomy_terms", ["dimension", "sort_order"])
    for rows in seed_rows():
        op.bulk_insert(terms, rows)

    # The main topic becomes a vocabulary code: the constant column lets the database check it against the topics.
    op.add_column("public_pages", sa.Column("topic_dimension", sa.String(20), nullable=False, server_default="topic"))
    op.create_check_constraint("ck_public_page_topic_dimension", "public_pages", "topic_dimension = 'topic'")
    op.drop_constraint("ck_public_page_topic", "public_pages", type_="check")
    op.create_foreign_key(
        "fk_public_page_topic", "public_pages", "taxonomy_terms", ["topic_dimension", "topic"], ["dimension", "code"],
    )

    op.create_table(
        "page_terms",
        sa.Column("page_id", sa.String(36), sa.ForeignKey("public_pages.id"), primary_key=True),
        sa.Column("dimension", sa.String(20), primary_key=True),
        sa.Column("code", sa.String(64), primary_key=True),
        sa.Column("position", sa.SmallInteger(), nullable=False),
        sa.ForeignKeyConstraint(["dimension", "code"], ["taxonomy_terms.dimension", "taxonomy_terms.code"], name="fk_page_term_term"),
        sa.CheckConstraint(f"dimension IN ({listed(PAGE_DIMENSIONS)})", name="ck_page_term_dimension"),
        sa.CheckConstraint("position >= 0", name="ck_page_term_position"),
    )
    op.create_index("ix_page_term_lookup", "page_terms", ["dimension", "code", "page_id"])

    op.create_table(
        "account_interests",
        sa.Column("account_id", sa.String(36), sa.ForeignKey("users.id"), primary_key=True),
        sa.Column("dimension", sa.String(20), primary_key=True),
        sa.Column("code", sa.String(64), primary_key=True),
        sa.Column("position", sa.SmallInteger(), nullable=False),
        sa.Column("chosen_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["dimension", "code"], ["taxonomy_terms.dimension", "taxonomy_terms.code"], name="fk_account_interest_term"),
        sa.CheckConstraint(f"dimension IN ({listed(INTEREST_DIMENSIONS)})", name="ck_account_interest_dimension"),
        sa.CheckConstraint("position >= 0", name="ck_account_interest_position"),
    )


def downgrade():
    connection = op.get_bind()
    # Classification and chosen interests have nowhere to go before 0032, so a downgrade that would lose them stops.
    new_topics = connection.execute(sa.text(
        f"SELECT count(*) FROM public_pages WHERE topic NOT IN ({listed(LEGACY_TOPICS)})"
    )).scalar()
    classified = connection.execute(sa.text("SELECT (SELECT count(*) FROM page_terms) + (SELECT count(*) FROM account_interests)")).scalar()
    if new_topics or classified:
        raise RuntimeError(
            "Downgrading below 0032 would lose page classification, chosen interests or main topics added by 0032; "
            "remove them first."
        )
    op.drop_table("account_interests")
    op.drop_index("ix_page_term_lookup", table_name="page_terms")
    op.drop_table("page_terms")
    op.drop_constraint("fk_public_page_topic", "public_pages", type_="foreignkey")
    op.create_check_constraint("ck_public_page_topic", "public_pages", f"topic IN ({listed(LEGACY_TOPICS)})")
    op.drop_constraint("ck_public_page_topic_dimension", "public_pages", type_="check")
    op.drop_column("public_pages", "topic_dimension")
    op.drop_index("ix_taxonomy_term_order", table_name="taxonomy_terms")
    op.drop_table("taxonomy_terms")
