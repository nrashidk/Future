/**
 * Migration: Populate Arabic translations for Grade 8 quiz questions
 * Covers all 6 UAE curriculum subjects for Grade 8
 * Uses question text as the match key since quiz_questions has no stable external ID
 */

import { db } from '../db';
import { quizQuestions } from '../../shared/schema';
import { eq } from 'drizzle-orm';

interface ArContent {
  question: string;          // English question text (used as match key)
  questionAr: string;
  optionsAr: string[];
  explanationAr: string;
}

const GRADE8_ARABIC_CONTENT: ArContent[] = [
  // ─── MATHEMATICS ───────────────────────────────────────────────
  {
    question: "Solve for x: 3x + 7 = 22",
    questionAr: "حل المعادلة: 3x + 7 = 22",
    optionsAr: ["x = 3", "x = 5", "x = 7", "x = 9"],
    explanationAr: "اطرح 7 من كلا الطرفين: 3x = 15. اقسم على 3: x = 5",
  },
  {
    question: "What is the area of a circle with radius 7 cm? (Use π ≈ 3.14)",
    questionAr: "ما مساحة دائرة نصف قطرها 7 سم؟ (استخدم π ≈ 3.14)",
    optionsAr: ["153.86 cm²", "43.96 cm²", "21.98 cm²", "615.44 cm²"],
    explanationAr: "المساحة = πr² = 3.14 × 7² = 3.14 × 49 = 153.86 سم²",
  },
  {
    question: "A shop offers a 25% discount on an item priced at AED 200. What is the final price?",
    questionAr: "يعرض متجر خصماً بنسبة 25% على سلعة سعرها 200 درهم. ما السعر النهائي؟",
    optionsAr: ["150 درهم", "175 درهم", "160 درهم", "180 درهم"],
    explanationAr: "الخصم = 25% من 200 = 50. السعر النهائي = 200 - 50 = 150 درهم",
  },
  {
    question: "In a survey of 50 students, 30 like football and 25 like basketball. If 10 like both, how many like only football?",
    questionAr: "في استطلاع شمل 50 طالباً، يحب 30 منهم كرة القدم و25 يحبون كرة السلة. إذا كان 10 يحبون كليهما، فكم عدد الذين يحبون كرة القدم فقط؟",
    optionsAr: ["20 طالباً", "15 طالباً", "25 طالباً", "30 طالباً"],
    explanationAr: "كرة القدم فقط = إجمالي كرة القدم - كلاهما = 30 - 10 = 20 طالباً",
  },
  {
    question: "What is the probability of rolling a number greater than 4 on a standard six-sided die?",
    questionAr: "ما احتمال ظهور رقم أكبر من 4 عند رمي حجر نرد سداسي الوجوه؟",
    optionsAr: ["1/3", "1/2", "2/3", "1/6"],
    explanationAr: "النتائج الملائمة: 5 و6 (نتيجتان). إجمالي النتائج: 6. الاحتمال = 2/6 = 1/3",
  },
  {
    question: "Simplify: 2x² + 3x - 5 + 4x² - x + 2",
    questionAr: "بسّط: 2x² + 3x - 5 + 4x² - x + 2",
    optionsAr: ["6x² + 2x - 3", "6x² + 4x - 7", "2x² + 2x - 3", "6x² + 2x + 3"],
    explanationAr: "اجمع الحدود المتشابهة: (2x² + 4x²) + (3x - x) + (-5 + 2) = 6x² + 2x - 3",
  },
  {
    question: "The ratio of boys to girls in a class is 3:2. If there are 15 boys, how many girls are there?",
    questionAr: "نسبة الأولاد إلى البنات في الفصل هي 3:2. إذا كان عدد الأولاد 15، فكم عدد البنات؟",
    optionsAr: ["10 بنات", "12 بنتاً", "8 بنات", "6 بنات"],
    explanationAr: "3:2 يعني لكل 3 أولاد 2 بنات. 15÷3=5، إذن 2×5=10 بنات",
  },
  {
    question: "What is the median of the data set: 5, 12, 8, 15, 3, 9?",
    questionAr: "ما الوسيط للبيانات: 5، 12، 8، 15، 3، 9؟",
    optionsAr: ["8.5", "9", "8", "12"],
    explanationAr: "رتّب البيانات: 3، 5، 8، 9، 12، 15. الوسيط = متوسط الرقمين الأوسطين: (8+9)÷2 = 8.5",
  },
  {
    question: "Convert 0.75 to a fraction in simplest form",
    questionAr: "حوّل 0.75 إلى كسر في أبسط صورة",
    optionsAr: ["3/4", "7/10", "15/20", "75/100"],
    explanationAr: "0.75 = 75/100. اقسم الطرفين على 25: 75÷25 = 3، 100÷25 = 4، إذن 3/4",
  },
  {
    question: "If a rectangular garden is 12 m long and 8 m wide, what is its perimeter?",
    questionAr: "إذا كانت حديقة مستطيلة طولها 12 متراً وعرضها 8 أمتار، ما محيطها؟",
    optionsAr: ["40 م", "96 م", "20 م", "48 م"],
    explanationAr: "المحيط = 2 × (الطول + العرض) = 2 × (12 + 8) = 2 × 20 = 40 متراً",
  },

  // ─── SCIENCE ───────────────────────────────────────────────────
  {
    question: "What is the process by which plants make their own food using sunlight?",
    questionAr: "ما العملية التي تصنع بها النباتات غذاءها باستخدام ضوء الشمس؟",
    optionsAr: ["التمثيل الضوئي", "التنفس", "الهضم", "التخمر"],
    explanationAr: "التمثيل الضوئي هو العملية التي تحوّل فيها النباتات ضوء الشمس والماء وثاني أكسيد الكربون إلى جلوكوز وأكسجين",
  },
  {
    question: "Which state of matter has a definite volume but no definite shape?",
    questionAr: "أيّ حالة من حالات المادة لها حجم محدد ولكن ليس لها شكل محدد؟",
    optionsAr: ["السائل", "الصلب", "الغاز", "البلازما"],
    explanationAr: "للسوائل حجم محدد، لكنها تأخذ شكل الإناء الذي توضع فيه",
  },
  {
    question: "What type of energy is stored in food?",
    questionAr: "ما نوع الطاقة المخزّنة في الطعام؟",
    optionsAr: ["طاقة كيميائية", "طاقة حركية", "طاقة ضوئية", "طاقة صوتية"],
    explanationAr: "يخزّن الطعام طاقة كيميائية في الروابط بين الذرات، تُطلَق أثناء الهضم",
  },
  {
    question: "What is the chemical formula for water?",
    questionAr: "ما الصيغة الكيميائية للماء؟",
    optionsAr: ["H₂O", "CO₂", "O₂", "H₂O₂"],
    explanationAr: "الماء مكوّن من ذرتَي هيدروجين وذرة أكسجين: H₂O",
  },
  {
    question: "Which organ in the human body pumps blood?",
    questionAr: "أيّ عضو في جسم الإنسان يضخّ الدم؟",
    optionsAr: ["القلب", "الرئتان", "الكبد", "الكلى"],
    explanationAr: "القلب هو العضو المسؤول عن ضخّ الدم في جميع أنحاء الجسم",
  },
  {
    question: "What happens to the volume of a gas when temperature increases (at constant pressure)?",
    questionAr: "ماذا يحدث لحجم الغاز عند ارتفاع درجة الحرارة مع ثبوت الضغط؟",
    optionsAr: ["يزداد الحجم", "ينقص الحجم", "يظل الحجم ثابتاً", "يتحول الغاز إلى سائل"],
    explanationAr: "وفق قانون شارل، عند ثبات الضغط يزداد حجم الغاز مع ارتفاع درجة الحرارة",
  },
  {
    question: "Which part of the cell controls all cellular activities and contains DNA?",
    questionAr: "أيّ جزء من الخلية يتحكم في جميع أنشطتها ويحتوي على الحمض النووي DNA؟",
    optionsAr: ["النواة", "السيتوبلازم", "غشاء الخلية", "الميتوكوندريا"],
    explanationAr: "النواة هي المركز التحكمي للخلية، تحتوي على المادة الوراثية (DNA) التي توجّه جميع وظائف الخلية",
  },
  {
    question: "What is the pH value of a neutral solution?",
    questionAr: "ما قيمة الأس الهيدروجيني (pH) للمحلول المتعادل؟",
    optionsAr: ["7", "0", "14", "1"],
    explanationAr: "يتراوح مقياس pH من 0 إلى 14. القيمة 7 تعني التعادل؛ أقل من 7 حمضي، وأكثر من 7 قاعدي",
  },
  {
    question: "What type of rock is formed when magma cools and solidifies?",
    questionAr: "ما نوع الصخر الذي يتكوّن عند تبرّد الصهارة وتصلّبها؟",
    optionsAr: ["صخر ناري", "صخر رسوبي", "صخر متحول", "حجر جيري"],
    explanationAr: "تتكوّن الصخور النارية من تبرّد الصهارة أو الحمم البركانية وتصلّبها",
  },
  {
    question: "What is the SI unit for measuring force?",
    questionAr: "ما الوحدة الدولية (SI) لقياس القوة؟",
    optionsAr: ["نيوتن (N)", "جول (J)", "واط (W)", "باسكال (Pa)"],
    explanationAr: "النيوتن (N) هو وحدة القوة في النظام الدولي، سمّي على اسم العالم إسحاق نيوتن",
  },

  // ─── ENGLISH ───────────────────────────────────────────────────
  {
    question: "Which word is a synonym for 'happy'?",
    questionAr: "أيّ كلمة مرادف لكلمة 'سعيد' (happy)؟",
    optionsAr: ["مبتهج (Joyful)", "حزين (Sad)", "غاضب (Angry)", "متعب (Tired)"],
    explanationAr: "كلمة Joyful تعني مليئاً بالبهجة والسعادة، وهي مرادف لكلمة happy",
  },
  {
    question: "Identify the verb in this sentence: 'The students study hard for their exams.'",
    questionAr: "حدّد الفعل في الجملة: 'The students study hard for their exams.'",
    optionsAr: ["study (يدرسون)", "students (الطلاب)", "hard (بجد)", "exams (الامتحانات)"],
    explanationAr: "'study' هي كلمة الفعل (الحدث) في الجملة",
  },
  {
    question: "Which sentence is written in the passive voice?",
    questionAr: "أيّ الجمل التالية مكتوبة بصيغة المبني للمجهول (passive voice)؟",
    optionsAr: ["The book was read by Ahmed.", "Ahmed read the book.", "Ahmed is reading the book.", "Ahmed will read the book."],
    explanationAr: "المبني للمجهول يركّز على الفعل نفسه (the book was read) لا على الفاعل",
  },
  {
    question: "What is the main purpose of a thesis statement in an essay?",
    questionAr: "ما الغرض الرئيسي من جملة الأطروحة (thesis statement) في المقالة؟",
    optionsAr: ["لصياغة الحجة أو الفكرة الرئيسية", "لختم المقالة", "لتقديم الأمثلة", "لتقديم الموضوع"],
    explanationAr: "تعرض جملة الأطروحة الحجة الرئيسية التي ستدعمها المقالة",
  },
  {
    question: "Which of these is a metaphor?",
    questionAr: "أيّ العبارات التالية تمثّل استعارة (metaphor)؟",
    optionsAr: ["Time is money (الوقت من ذهب)", "He runs like the wind (يركض كالريح)", "The stars twinkled (تلألأت النجوم)", "She sings beautifully (تغني بجمال)"],
    explanationAr: "الاستعارة تقارن بين شيئين مختلفين مباشرةً دون استخدام 'like' أو 'as'",
  },
  {
    question: "What is the plural form of 'child'?",
    questionAr: "ما صيغة الجمع لكلمة 'child' (طفل)؟",
    optionsAr: ["Children", "Childs", "Childes", "Childrens"],
    explanationAr: "'child' اسم غير منتظم، وجمعه 'children'",
  },
  {
    question: "Which punctuation mark is used to show possession?",
    questionAr: "أيّ علامة ترقيم تُستخدم للدلالة على الملكية؟",
    optionsAr: ["الفاصلة العليا (Apostrophe ')", "الفاصلة (,)", "النقطة (.)", "الفاصلة المنقوطة (;)"],
    explanationAr: "تُستخدم الفاصلة العليا للدلالة على الملكية، مثل: Sarah's book",
  },
  {
    question: "What does the suffix '-ful' mean in words like 'beautiful' and 'helpful'?",
    questionAr: "ما معنى اللاحقة '-ful' في كلمات مثل 'beautiful' و'helpful'؟",
    optionsAr: ["مليء بـ (Full of)", "بدون (Without)", "قبل (Before)", "ضد (Against)"],
    explanationAr: "اللاحقة '-ful' تعني 'مليء بـ' (beautiful = مليء بالجمال، helpful = مليء بالمساعدة)",
  },
  {
    question: "Which sentence is grammatically correct?",
    questionAr: "أيّ الجمل صحيحة نحوياً؟",
    optionsAr: ["She and I went to the market.", "Me and her went to the market.", "Her and me went to the market.", "I and she went to the market."],
    explanationAr: "تُستخدم الضمائر الفاعلية (I, she) في موقع الفاعل. 'She and I' هو الشكل الصحيح",
  },
  {
    question: "What type of noun is 'happiness'?",
    questionAr: "ما نوع الاسم 'happiness' (السعادة)؟",
    optionsAr: ["اسم مجرد (Abstract noun)", "اسم ملموس (Concrete noun)", "اسم علم (Proper noun)", "اسم جمع (Collective noun)"],
    explanationAr: "الأسماء المجردة تسمّي أفكاراً أو مشاعر أو صفات لا يمكن رؤيتها أو لمسها (happiness, love, courage)",
  },

  // ─── ARABIC SUBJECT ────────────────────────────────────────────
  {
    question: "What is the correct plural form of (كتاب) 'book' in Arabic?",
    questionAr: "ما صيغة الجمع الصحيحة لكلمة (كتاب) في اللغة العربية؟",
    optionsAr: ["كتب", "كتابان", "كتابات", "كتبة"],
    explanationAr: "جمع التكسير لكلمة كتاب هو كتب",
  },
  {
    question: "Which word means 'school' in Arabic?",
    questionAr: "أيّ كلمة تعني 'مدرسة' في اللغة العربية؟",
    optionsAr: ["مدرسة", "بيت", "مكتب", "مستشفى"],
    explanationAr: "مدرسة (madrasa) تعني school بالإنجليزية",
  },
  {
    question: "What is the dual form of (طالب) 'student'?",
    questionAr: "ما صيغة المثنى لكلمة (طالب)؟",
    optionsAr: ["طالبان", "طلاب", "طالبين", "طالبات"],
    explanationAr: "المثنى المرفوع لكلمة طالب هو طالبان",
  },
  {
    question: "Which sentence is grammatically correct?",
    questionAr: "أيّ الجمل التالية صحيحة نحوياً؟",
    optionsAr: ["الطالب يدرس في المدرسة", "يدرس الطالب المدرسة في", "في المدرسة الطالب يدرس", "المدرسة في يدرس الطالب"],
    explanationAr: "الترتيب الصحيح في العربية هو المبتدأ ثم الخبر (الفعل): الطالب يدرس في المدرسة",
  },
  {
    question: "What type of noun is (محمد) 'Muhammad' in Arabic grammar?",
    questionAr: "ما نوع الاسم (محمد) في النحو العربي؟",
    optionsAr: ["اسم علم", "اسم نكرة", "اسم فعل", "اسم إشارة"],
    explanationAr: "محمد اسم علم لأنه يدل على شخص بعينه",
  },
  {
    question: "What does (بيت) mean in Arabic?",
    questionAr: "ما معنى كلمة (بيت)؟",
    optionsAr: ["منزل (House)", "مدرسة (School)", "حديقة (Garden)", "سوق (Market)"],
    explanationAr: "بيت (bayt) تعني 'house' أو 'home' بالإنجليزية",
  },
  {
    question: "Which is the correct feminine form of (طالب) 'male student'?",
    questionAr: "ما صيغة المؤنث الصحيحة لكلمة (طالب)؟",
    optionsAr: ["طالبة", "طلاب", "طالبان", "طالبين"],
    explanationAr: "صيغة المؤنث المفردة لـ طالب هي طالبة",
  },
  {
    question: "What is the meaning of (يكتب) yaktubu?",
    questionAr: "ما معنى الفعل (يكتب)؟",
    optionsAr: ["He writes (هو يكتب)", "He reads (هو يقرأ)", "He speaks (هو يتكلم)", "He listens (هو يستمع)"],
    explanationAr: "يكتب (yaktubu) فعل مضارع للغائب المذكر بمعنى 'he writes'",
  },
  {
    question: "Which word means 'today' in Arabic?",
    questionAr: "أيّ كلمة تعني 'اليوم' (today)؟",
    optionsAr: ["اليوم", "غداً", "أمس", "الآن"],
    explanationAr: "اليوم (al-yawm) تعني 'today' بالإنجليزية",
  },
  {
    question: "What is the correct definite article in Arabic?",
    questionAr: "ما أداة التعريف الصحيحة في اللغة العربية؟",
    optionsAr: ["ال (al-)", "في (fī)", "من (min)", "إلى (ilā)"],
    explanationAr: "أداة التعريف في العربية هي (ال)، وتقابل 'the' في الإنجليزية",
  },

  // ─── SOCIAL STUDIES ────────────────────────────────────────────
  {
    question: "When was the United Arab Emirates officially founded?",
    questionAr: "متى تأسست دولة الإمارات العربية المتحدة رسمياً؟",
    optionsAr: ["2 ديسمبر 1971", "2 ديسمبر 1970", "1 يناير 1972", "2 ديسمبر 1972"],
    explanationAr: "تأسست الإمارات في 2 ديسمبر 1971 عندما اتحدت الإمارات السبع",
  },
  {
    question: "Who is known as the founding father of the UAE?",
    questionAr: "من يُعدّ مؤسس دولة الإمارات العربية المتحدة؟",
    optionsAr: ["الشيخ زايد بن سلطان آل نهيان", "الشيخ راشد بن سعيد آل مكتوم", "الشيخ خليفة بن زايد", "الشيخ محمد بن راشد"],
    explanationAr: "يُكرَّم الشيخ زايد بن سلطان آل نهيان بوصفه مؤسس دولة الإمارات",
  },
  {
    question: "How many emirates make up the United Arab Emirates?",
    questionAr: "كم عدد الإمارات التي تتكوّن منها دولة الإمارات العربية المتحدة؟",
    optionsAr: ["سبع", "خمس", "ست", "ثماني"],
    explanationAr: "تتكوّن الإمارات من سبع إمارات: أبوظبي ودبي والشارقة وعجمان وأم القيوين ورأس الخيمة والفجيرة",
  },
  {
    question: "Which emirate is the capital of the UAE?",
    questionAr: "أيّ إمارة هي عاصمة دولة الإمارات العربية المتحدة؟",
    optionsAr: ["أبوظبي", "دبي", "الشارقة", "رأس الخيمة"],
    explanationAr: "أبوظبي هي عاصمة الإمارات وأكبر إماراتها",
  },
  {
    question: "What is the traditional boat used for pearl diving in the UAE called?",
    questionAr: "ما اسم القارب التقليدي المستخدم في صيد اللؤلؤ في الإمارات؟",
    optionsAr: ["الداو (Dhow)", "فلوكة (Felucca)", "غندولا (Gondola)", "قارب كانو (Canoe)"],
    explanationAr: "الداو هو القارب الخشبي التقليدي الذي استُخدم تاريخياً في صيد اللؤلؤ والتجارة بالإمارات",
  },
  {
    question: "What is the national currency of the UAE?",
    questionAr: "ما العملة الوطنية لدولة الإمارات العربية المتحدة؟",
    optionsAr: ["الدرهم الإماراتي (AED)", "الريال السعودي", "الدينار الكويتي", "الريال القطري"],
    explanationAr: "الدرهم الإماراتي (AED) هو العملة الرسمية لدولة الإمارات",
  },
  {
    question: "Which sea borders the UAE to the north?",
    questionAr: "أيّ بحر يحدّ الإمارات من الشمال؟",
    optionsAr: ["الخليج العربي", "البحر الأحمر", "البحر المتوسط", "بحر قزوين"],
    explanationAr: "يحدّ الإمارات الخليج العربي من الشمال وخليج عُمان من الشرق",
  },
  {
    question: "What is the traditional Emirati male headwear called?",
    questionAr: "ما اسم غطاء الرأس التقليدي للرجل الإماراتي؟",
    optionsAr: ["الغترة والعقال", "العمامة", "الطربوش", "الكوفية فقط"],
    explanationAr: "يرتدي الرجل الإماراتي تقليدياً الغترة (قماش الرأس) مثبّتة بالعقال (الحبل الأسود)",
  },
  {
    question: "When did oil exports begin in the UAE?",
    questionAr: "متى بدأت صادرات النفط في الإمارات العربية المتحدة؟",
    optionsAr: ["الستينيات", "الخمسينيات", "الأربعينيات", "الثمانينيات"],
    explanationAr: "بدأت صادرات النفط من أبوظبي عام 1962، مما غيّر اقتصاد الإمارات",
  },
  {
    question: "What is the Federal National Council (FNC)?",
    questionAr: "ما المجلس الوطني الاتحادي (FNC)؟",
    optionsAr: ["الهيئة التشريعية الاستشارية للإمارات", "المحكمة العليا", "مجلس الوزراء", "المجلس العسكري"],
    explanationAr: "المجلس الوطني الاتحادي هو الهيئة البرلمانية في الإمارات التي تراجع التشريعات وتقترحها",
  },

  // ─── COMPUTER SCIENCE ──────────────────────────────────────────
  {
    question: "What does CPU stand for in computer terminology?",
    questionAr: "ماذا يعني اختصار CPU في مصطلحات الحاسوب؟",
    optionsAr: ["وحدة المعالجة المركزية (Central Processing Unit)", "وحدة الحاسوب الشخصي (Computer Personal Unit)", "أداة البرنامج المركزية (Central Program Utility)", "وحدة معالجة الحاسوب (Computer Processing Unit)"],
    explanationAr: "CPU اختصار لـ Central Processing Unit، وهي العقل المعالج للحاسوب",
  },
  {
    question: "Which of these is an example of an input device?",
    questionAr: "أيّ الأجهزة التالية مثال على جهاز إدخال؟",
    optionsAr: ["لوحة المفاتيح (Keyboard)", "الشاشة (Monitor)", "الطابعة (Printer)", "السماعة (Speaker)"],
    explanationAr: "لوحة المفاتيح جهاز إدخال تُستخدم لإدخال البيانات إلى الحاسوب",
  },
  {
    question: "What is the primary purpose of an operating system?",
    questionAr: "ما الغرض الرئيسي لنظام التشغيل؟",
    optionsAr: ["إدارة موارد الحاسوب من عتاد وبرامج", "تصفح الإنترنت", "إنشاء المستندات", "تشغيل الألعاب"],
    explanationAr: "نظام التشغيل يدير العتاد والبرامج ويوفر الخدمات للبرامج التطبيقية",
  },
  {
    question: "In programming, what is a 'variable'?",
    questionAr: "في البرمجة، ما المقصود بـ 'المتغير' (variable)؟",
    optionsAr: ["موقع تخزين مسمّى يحتفظ ببيانات", "نوع من الحلقات", "دالة برمجية", "خطأ برمجي"],
    explanationAr: "المتغير وعاء يخزّن قيماً يمكن أن تتغير أثناء تنفيذ البرنامج",
  },
  {
    question: "What does HTML stand for?",
    questionAr: "ماذا يعني اختصار HTML؟",
    optionsAr: ["لغة ترميز النص التشعبي (HyperText Markup Language)", "لغة تقنية حديثة عالية (High Tech Modern Language)", "لغة ترميز أداة المنزل (Home Tool Markup Language)", "الروابط والنص التشعبي (Hyperlinks and Text Markup Language)"],
    explanationAr: "HTML اختصار لـ HyperText Markup Language، وتُستخدم لإنشاء صفحات الويب",
  },
  {
    question: "What is the correct order of problem-solving steps in computational thinking?",
    questionAr: "ما الترتيب الصحيح لخطوات حل المشكلات في التفكير الحوسبي؟",
    optionsAr: ["افهم، خطّط، نفّذ، راجع", "نفّذ، خطّط، راجع، افهم", "خطّط، نفّذ، افهم، راجع", "راجع، افهم، خطّط، نفّذ"],
    explanationAr: "دورة حل المشكلات: فهم المشكلة، التخطيط للحل، التنفيذ، ومراجعة النتائج",
  },
  {
    question: "What is the purpose of RAM in a computer?",
    questionAr: "ما وظيفة ذاكرة الوصول العشوائي (RAM) في الحاسوب؟",
    optionsAr: ["تخزين مؤقت للبرامج والبيانات قيد التشغيل", "تخزين دائم للملفات", "معالجة الحسابات", "عرض الرسومات"],
    explanationAr: "RAM (ذاكرة الوصول العشوائي) تخزّن مؤقتاً البيانات والبرامج المستخدمة حالياً، وتُمسح عند إيقاف التشغيل",
  },
  {
    question: "Which programming language is known for creating web pages?",
    questionAr: "أيّ لغة برمجة معروفة بإنشاء صفحات الويب التفاعلية؟",
    optionsAr: ["JavaScript", "Python", "C++", "Java"],
    explanationAr: "JavaScript هي اللغة البرمجية الأساسية لإنشاء صفحات الويب التفاعلية والتطبيقات",
  },
  {
    question: "What does 'www' stand for in a website URL?",
    questionAr: "ماذا يعني اختصار 'www' في عنوان URL للموقع الإلكتروني؟",
    optionsAr: ["شبكة الويب العالمية (World Wide Web)", "ويب عالمي واسع (World Web Wide)", "ويب عالمي واسع (Web World Wide)", "واسع عالمي ويب (Wide World Web)"],
    explanationAr: "WWW اختصار لـ World Wide Web، وهي نظام الصفحات المترابطة التي يمكن الوصول إليها عبر الإنترنت",
  },
  {
    question: "What is a 'bug' in programming?",
    questionAr: "ما المقصود بـ 'البق' (bug) في البرمجة؟",
    optionsAr: ["خطأ أو عيب في الكود", "نوع من الفيروسات", "لغة برمجية", "مكوّن حاسوبي"],
    explanationAr: "البق هو خطأ أو عيب أو سلوك غير مقصود في البرنامج ينتج نتائج خاطئة",
  },
];

/**
 * Apply Arabic translations to Grade 8 quiz questions already in the DB.
 * Matches by question text (English), then UPDATEs questionAr / optionsAr / explanationAr.
 */
export async function applyGrade8ArabicContent(): Promise<void> {
  console.log('🌐 Applying Arabic translations to Grade 8 quiz questions...');
  let updated = 0;
  let skipped = 0;

  for (const item of GRADE8_ARABIC_CONTENT) {
    try {
      const rows = await db
        .select({ id: quizQuestions.id })
        .from(quizQuestions)
        .where(eq(quizQuestions.question, item.question));

      if (rows.length === 0) {
        skipped++;
        continue;
      }

      for (const row of rows) {
        await db
          .update(quizQuestions)
          .set({
            questionAr: item.questionAr,
            optionsAr: item.optionsAr as any,
            explanationAr: item.explanationAr,
          })
          .where(eq(quizQuestions.id, row.id));
        updated++;
      }
    } catch (err) {
      console.error(`  ⚠ Failed to update question: "${item.question.slice(0, 60)}"`, err);
    }
  }

  console.log(`✓ Grade 8 Arabic quiz content: ${updated} updated, ${skipped} not found`);
}
