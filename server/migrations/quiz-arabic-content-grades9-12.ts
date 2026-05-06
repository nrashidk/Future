/**
 * Migration: Populate Arabic translations for Grade 9–12 quiz questions
 * Covers all 6 UAE curriculum subjects for Grades 9, 10, 11, 12
 * Uses question text as the match key since quiz_questions has no stable external ID
 */

import { db } from '../db';
import { quizQuestions } from '../../shared/schema';
import { eq } from 'drizzle-orm';

interface ArContent {
  question: string;
  questionAr: string;
  optionsAr: string[];
  explanationAr: string;
}

const GRADES9_12_ARABIC_CONTENT: ArContent[] = [

  // ═══════════════════════════════════════════════════════════════════
  // MATHEMATICS — GRADE 9
  // ═══════════════════════════════════════════════════════════════════
  {
    question: "Solve for y: 5y - 3 = 2y + 9",
    questionAr: "حل المعادلة: 5y - 3 = 2y + 9",
    optionsAr: ["y = 4", "y = 6", "y = 3", "y = 2"],
    explanationAr: "اطرح 2y من كلا الطرفين: 3y - 3 = 9. أضف 3: 3y = 12. اقسم على 3: y = 4",
  },
  {
    question: "What is 15% of 200?",
    questionAr: "ما مقدار 15% من 200؟",
    optionsAr: ["30", "15", "45", "3"],
    explanationAr: "15% من 200 = 0.15 × 200 = 30",
  },
  {
    question: "A triangle has angles measuring 45° and 65°. What is the measure of the third angle?",
    questionAr: "مثلث زاويتان فيه 45° و65°. ما قياس الزاوية الثالثة؟",
    optionsAr: ["70°", "80°", "60°", "90°"],
    explanationAr: "مجموع زوايا المثلث = 180°. الزاوية الثالثة = 180° - 45° - 65° = 70°",
  },
  {
    question: "Which number is a prime number?",
    questionAr: "أيٌّ من الأعداد التالية عدد أولي؟",
    optionsAr: ["17", "21", "27", "35"],
    explanationAr: "17 لا يقبل القسمة إلا على 1 وعلى نفسه. 21=3×7، 27=3×9، 35=5×7 أعداد مركبة",
  },
  {
    question: "Simplify: √64",
    questionAr: "بسّط: √64",
    optionsAr: ["8", "32", "4", "16"],
    explanationAr: "√64 = 8 لأن 8 × 8 = 64",
  },
  {
    question: "What is the volume of a cube with side length 5 cm?",
    questionAr: "ما حجم مكعب طول ضلعه 5 سم؟",
    optionsAr: ["125 cm³", "75 cm³", "25 cm³", "15 cm³"],
    explanationAr: "الحجم = الضلع³ = 5³ = 5 × 5 × 5 = 125 سم³",
  },
  {
    question: "If 3x = 27, what is the value of x?",
    questionAr: "إذا كان 3x = 27، فما قيمة x؟",
    optionsAr: ["9", "24", "30", "81"],
    explanationAr: "اقسم كلا الطرفين على 3: x = 27 ÷ 3 = 9",
  },
  {
    question: "A bag contains 4 red marbles, 3 blue marbles, and 5 green marbles. What is the probability of randomly selecting a blue marble?",
    questionAr: "كيس يحتوي على 4 كرات حمراء و3 زرقاء و5 خضراء. ما احتمال اختيار كرة زرقاء عشوائياً؟",
    optionsAr: ["3/12 أو 1/4", "3/7", "1/3", "1/2"],
    explanationAr: "إجمالي الكرات = 4 + 3 + 5 = 12. الاحتمال = 3/12 = 1/4",
  },
  {
    question: "Express 2³ × 2⁴ as a single power of 2",
    questionAr: "عبّر عن 2³ × 2⁴ كأسٍّ وحيد للعدد 2",
    optionsAr: ["2⁷", "2¹²", "4⁷", "2"],
    explanationAr: "عند ضرب قوى ذات قاعدة واحدة، تُجمع الأسس: 2³⁺⁴ = 2⁷",
  },
  {
    question: "The scale on a map is 1:50000. If two cities are 4 cm apart on the map, what is the actual distance between them?",
    questionAr: "مقياس رسم خريطة هو 1:50000. إذا كانت مدينتان تبعدان 4 سم على الخريطة، فما المسافة الفعلية بينهما؟",
    optionsAr: ["2 كم", "200 كم", "20 كم", "200 م"],
    explanationAr: "المسافة الفعلية = 4 × 50000 = 200000 سم = 2000 م = 2 كم",
  },

  // ═══════════════════════════════════════════════════════════════════
  // MATHEMATICS — GRADE 10
  // ═══════════════════════════════════════════════════════════════════
  {
    question: "Solve the system of equations: 2x + y = 7 and x - y = 2",
    questionAr: "حل نظام المعادلتين: 2x + y = 7 و x - y = 2",
    optionsAr: ["x = 3, y = 1", "x = 2, y = 3", "x = 4, y = -1", "x = 1, y = 5"],
    explanationAr: "اجمع المعادلتين: 3x = 9، إذن x = 3. عوّض: 3 - y = 2، إذن y = 1",
  },
  {
    question: "What is the value of sin(30°)?",
    questionAr: "ما قيمة sin(30°)؟",
    optionsAr: ["1/2", "√3/2", "1", "√2/2"],
    explanationAr: "sin(30°) = 1/2 وهي قيمة مثلثية قياسية للزوايا الخاصة",
  },
  {
    question: "Find the 10th term of the arithmetic sequence: 3, 7, 11, 15, ...",
    questionAr: "أوجد الحد العاشر في المتتالية الحسابية: 3، 7، 11، 15، ...",
    optionsAr: ["39", "43", "47", "35"],
    explanationAr: "الحد الأول a = 3، الفرق المشترك d = 4. الصيغة: aₙ = a + (n-1)d = 3 + 9(4) = 39",
  },
  {
    question: "If f(x) = 2x² - 3x + 1, what is f(3)?",
    questionAr: "إذا كانت f(x) = 2x² - 3x + 1، فما قيمة f(3)؟",
    optionsAr: ["10", "12", "8", "15"],
    explanationAr: "f(3) = 2(3)² - 3(3) + 1 = 2(9) - 9 + 1 = 18 - 9 + 1 = 10",
  },
  {
    question: "What is the equation of a line with slope 2 passing through point (1, 3)?",
    questionAr: "ما معادلة خط ميله 2 ويمر بالنقطة (1، 3)؟",
    optionsAr: ["y = 2x + 1", "y = 2x + 3", "y = 2x - 1", "y = 2x + 5"],
    explanationAr: "باستخدام صيغة الميل والنقطة: y - 3 = 2(x - 1)، تبسيط: y = 2x + 1",
  },
  {
    question: "A box contains 5 red balls and 3 blue balls. If two balls are drawn without replacement, what is the probability both are red?",
    questionAr: "صندوق يحتوي على 5 كرات حمراء و3 زرقاء. إذا سُحبت كرتان دون إرجاع، ما احتمال أن تكونا حمراوتين؟",
    optionsAr: ["5/14", "10/28", "5/8", "25/64"],
    explanationAr: "الاحتمال = (5/8) × (4/7) = 20/56 = 5/14",
  },
  {
    question: "Factor completely: x² - 9",
    questionAr: "حلّل كلياً: x² - 9",
    optionsAr: ["(x - 3)(x + 3)", "(x - 9)(x + 1)", "(x - 3)²", "لا يمكن تحليلها"],
    explanationAr: "هذا فرق المربعين: a² - b² = (a - b)(a + b)، إذن x² - 9 = (x - 3)(x + 3)",
  },

  // ═══════════════════════════════════════════════════════════════════
  // MATHEMATICS — GRADE 11
  // ═══════════════════════════════════════════════════════════════════
  {
    question: "The mean of five numbers is 12. If four of the numbers are 8, 10, 14, and 15, what is the fifth number?",
    questionAr: "متوسط خمسة أعداد هو 12. إذا كانت أربعة منها 8 و10 و14 و15، فما العدد الخامس؟",
    optionsAr: ["13", "11", "12", "14"],
    explanationAr: "المجموع = 12 × 5 = 60. مجموع الأربعة = 8 + 10 + 14 + 15 = 47. الخامس = 60 - 47 = 13",
  },
  {
    question: "Solve the quadratic equation: x² - 5x + 6 = 0",
    questionAr: "حل المعادلة التربيعية: x² - 5x + 6 = 0",
    optionsAr: ["x = 2 أو x = 3", "x = 1 أو x = 6", "x = -2 أو x = -3", "x = 5 أو x = 6"],
    explanationAr: "تحليل: (x - 2)(x - 3) = 0، إذن x = 2 أو x = 3",
  },
  {
    question: "What is the value of cos(60°)?",
    questionAr: "ما قيمة cos(60°)؟",
    optionsAr: ["1/2", "√3/2", "1", "0"],
    explanationAr: "cos(60°) = 1/2 وهي قيمة مثلثية قياسية للزوايا الخاصة",
  },
  {
    question: "Find the sum of the first 10 terms of the geometric sequence: 2, 6, 18, 54, ...",
    questionAr: "أوجد مجموع أول 10 حدود للمتتالية الهندسية: 2، 6، 18، 54، ...",
    optionsAr: ["59048", "29524", "19682", "39366"],
    explanationAr: "a = 2، r = 3. المجموع Sₙ = a(rⁿ - 1)/(r - 1) = 2(3¹⁰ - 1)/(3 - 1) = 2(59049 - 1)/2 = 59048",
  },
  {
    question: "What is the derivative of f(x) = 3x² + 2x - 5?",
    questionAr: "ما مشتقة f(x) = 3x² + 2x - 5؟",
    optionsAr: ["6x + 2", "3x² + 2", "6x - 5", "3x + 2"],
    explanationAr: "باستخدام قاعدة الأس: d/dx(3x²) = 6x، d/dx(2x) = 2، d/dx(-5) = 0. إذن f'(x) = 6x + 2",
  },
  {
    question: "Convert log₂(32) to its numerical value",
    questionAr: "حوّل log₂(32) إلى قيمته العددية",
    optionsAr: ["5", "4", "6", "3"],
    explanationAr: "log₂(32) تعني: 2 مرفوعة لأي أس تساوي 32؟ بما أن 2⁵ = 32، إذن log₂(32) = 5",
  },
  {
    question: "What is the distance between points A(1, 2) and B(4, 6) in the coordinate plane?",
    questionAr: "ما المسافة بين النقطتين A(1, 2) و B(4, 6) في المستوى الإحداثي؟",
    optionsAr: ["5", "7", "√7", "√13"],
    explanationAr: "المسافة = √[(4-1)² + (6-2)²] = √[9 + 16] = √25 = 5",
  },

  // ═══════════════════════════════════════════════════════════════════
  // MATHEMATICS — GRADE 12
  // ═══════════════════════════════════════════════════════════════════
  {
    question: "In a normal distribution, approximately what percentage of data falls within one standard deviation of the mean?",
    questionAr: "في التوزيع الطبيعي، ما النسبة التقريبية للبيانات الواقعة ضمن انحراف معياري واحد من المتوسط؟",
    optionsAr: ["68%", "95%", "99.7%", "50%"],
    explanationAr: "تنص القاعدة التجريبية على أن حوالي 68% من البيانات تقع ضمن انحراف معياري واحد من المتوسط",
  },
  {
    question: "If matrix A = [2 3; 1 4], what is the determinant of A?",
    questionAr: "إذا كانت المصفوفة A = [2 3; 1 4]، فما محدد A؟",
    optionsAr: ["5", "8", "11", "3"],
    explanationAr: "لمصفوفة 2×2 [a b; c d]، المحدد = ad - bc = (2)(4) - (3)(1) = 8 - 3 = 5",
  },
  {
    question: "Simplify: (x³)⁴",
    questionAr: "بسّط: (x³)⁴",
    optionsAr: ["x¹²", "x⁷", "x⁶⁴", "4x³"],
    explanationAr: "عند رفع أسٍّ إلى أس، تُضرب الأسس: (x³)⁴ = x³ˣ⁴ = x¹²",
  },
  {
    question: "The surface area of a sphere with radius r is given by 4πr². What is the surface area when r = 3 cm? (Use π ≈ 3.14)",
    questionAr: "مساحة سطح كرة نصف قطرها r تعطى بـ 4πr². ما المساحة عند r = 3 سم؟ (استخدم π ≈ 3.14)",
    optionsAr: ["113.04 cm²", "28.26 cm²", "36 cm²", "37.68 cm²"],
    explanationAr: "المساحة = 4πr² = 4 × 3.14 × 3² = 4 × 3.14 × 9 = 113.04 سم²",
  },
  {
    question: "If tan(θ) = 3/4 and θ is in the first quadrant, what is sin(θ)?",
    questionAr: "إذا كان tan(θ) = 3/4 وθ في الربع الأول، فما قيمة sin(θ)؟",
    optionsAr: ["3/5", "4/5", "3/4", "4/3"],
    explanationAr: "المماس = المقابل/المجاور = 3/4. بنظرية فيثاغورس: الوتر = √(3² + 4²) = 5. إذن sin(θ) = 3/5",
  },
  {
    question: "Which of the following represents an inverse variation?",
    questionAr: "أيٌّ مما يلي يمثل تناسباً عكسياً؟",
    optionsAr: ["xy = 12", "y = 3x + 5", "y = x²", "y = 2x"],
    explanationAr: "التناسب العكسي له الصورة xy = k (ثابت). عندما يزداد x تنقص y بالتناسب",
  },

  // ═══════════════════════════════════════════════════════════════════
  // SCIENCE — GRADE 9
  // ═══════════════════════════════════════════════════════════════════
  {
    question: "In a food chain, what are organisms that make their own food called?",
    questionAr: "في السلسلة الغذائية، ما اسم الكائنات التي تصنع غذاءها بنفسها؟",
    optionsAr: ["المنتجون", "المستهلكون", "المحللون", "المفترسون"],
    explanationAr: "المنتجون (كالنباتات) يصنعون غذاءهم عن طريق التمثيل الضوئي ويشكّلون قاعدة السلاسل الغذائية",
  },
  {
    question: "What happens during a chemical reaction?",
    questionAr: "ماذا يحدث أثناء التفاعل الكيميائي؟",
    optionsAr: ["تتكون مواد جديدة", "تحدث تغيرات فيزيائية فقط", "تُستحدث ذرات", "تُفقد كتلة"],
    explanationAr: "تنطوي التفاعلات الكيميائية على كسر الروابط وتكوين روابط جديدة مما ينتج مواد مختلفة الخصائص",
  },
  {
    question: "What is the relationship between speed, distance, and time?",
    questionAr: "ما العلاقة بين السرعة والمسافة والزمن؟",
    optionsAr: ["السرعة = المسافة ÷ الزمن", "السرعة = المسافة × الزمن", "السرعة = الزمن ÷ المسافة", "السرعة = المسافة + الزمن"],
    explanationAr: "تُحسب السرعة بقسمة المسافة المقطوعة على الزمن المستغرق",
  },
  {
    question: "Which blood vessels carry blood away from the heart?",
    questionAr: "أيٌّ من الأوعية الدموية يحمل الدم بعيداً عن القلب؟",
    optionsAr: ["الشرايين", "الأوردة", "الشعيرات الدموية", "الأوعية اللمفاوية"],
    explanationAr: "تحمل الشرايين الدم المؤكسج من القلب إلى الأنسجة، بينما تعيده الأوردة إلى القلب",
  },
  {
    question: "What is the atomic number of an element?",
    questionAr: "ما العدد الذري للعنصر؟",
    optionsAr: ["عدد البروتونات في النواة", "عدد النيوترونات", "عدد الإلكترونات", "الكتلة الكلية"],
    explanationAr: "العدد الذري يساوي عدد البروتونات في نواة الذرة وهو ما يحدد هوية العنصر",
  },
  {
    question: "What type of energy transformation occurs in a light bulb?",
    questionAr: "ما نوع تحول الطاقة الذي يحدث في المصباح الكهربائي؟",
    optionsAr: ["طاقة كهربائية إلى ضوء وحرارة", "طاقة ضوئية إلى كهربائية", "كيميائية إلى ميكانيكية", "نووية إلى حرارية"],
    explanationAr: "يحوّل المصباح الكهربائي الطاقة الكهربائية إلى طاقة ضوئية وطاقة حرارية",
  },
  {
    question: "Which process do plants use to release energy from glucose?",
    questionAr: "أيٌّ من العمليات تستخدمه النباتات لتحرير الطاقة من الجلوكوز؟",
    optionsAr: ["التنفس الخلوي", "التمثيل الضوئي", "النتح", "الإنبات"],
    explanationAr: "تستخدم النباتات والحيوانات على حد سواء التنفس الخلوي لتحطيم الجلوكوز وتحرير الطاقة",
  },
  {
    question: "According to the law of conservation of mass, what happens to mass during a chemical reaction?",
    questionAr: "وفق قانون حفظ الكتلة، ماذا يحدث للكتلة أثناء التفاعل الكيميائي؟",
    optionsAr: ["تبقى الكتلة ثابتة", "تزداد الكتلة", "تنقص الكتلة", "تتحول الكتلة إلى طاقة"],
    explanationAr: "ينص قانون حفظ الكتلة على أن الكتلة لا تُستحدث ولا تُفنى في التفاعلات الكيميائية",
  },
  {
    question: "A ball is dropped from a height. As it falls, what happens to its potential and kinetic energy?",
    questionAr: "كرة سقطت من ارتفاع. أثناء السقوط، ماذا يحدث لطاقتها الكامنة والحركية؟",
    optionsAr: ["الكامنة تنقص والحركية تزداد", "كلتاهما تزداد", "كلتاهما تنقص", "الكامنة تزداد والحركية تنقص"],
    explanationAr: "أثناء السقوط، تتحول الطاقة الكامنة الجاذبية إلى طاقة حركية وتبقى الطاقة الميكانيكية الكلية ثابتة",
  },
  {
    question: "If an organism has 46 chromosomes in its body cells, how many chromosomes will its gametes (sex cells) have?",
    questionAr: "إذا كان للكائن الحي 46 كروموسوماً في خلاياه الجسدية، فكم كروموسوماً في خلاياه الجنسية (الأمشاج)؟",
    optionsAr: ["23", "46", "92", "12"],
    explanationAr: "تُنتج الأمشاج عن طريق الانقسام المنصف الذي ينصف عدد الكروموسومات. الأمشاج البشرية لها 23 كروموسوماً",
  },

  // ═══════════════════════════════════════════════════════════════════
  // SCIENCE — GRADE 10
  // ═══════════════════════════════════════════════════════════════════
  {
    question: "What is the acceleration of an object with mass 5 kg when a force of 20 N is applied? (Use F = ma)",
    questionAr: "ما تسارع جسم كتلته 5 كغ عند تطبيق قوة مقدارها 20 نيوتن؟ (استخدم F = ma)",
    optionsAr: ["4 m/s²", "100 m/s²", "25 m/s²", "0.25 m/s²"],
    explanationAr: "بقانون نيوتن الثاني F = ma: التسارع a = F/m = 20/5 = 4 م/ث²",
  },
  {
    question: "In a redox reaction, what happens to the oxidizing agent?",
    questionAr: "في تفاعل الأكسدة والاختزال، ماذا يحدث للعامل المؤكسد؟",
    optionsAr: ["يُختزل", "يُؤكسد", "يبقى دون تغيير", "يتحلل"],
    explanationAr: "العامل المؤكسد يكتسب إلكترونات وبالتالي يُختزل هو نفسه",
  },
  {
    question: "Which organelle is known as the 'powerhouse of the cell'?",
    questionAr: "أي عضية تُعرف بـ'محطة توليد الطاقة في الخلية'؟",
    optionsAr: ["الميتوكوندريا", "النواة", "الريبوسوم", "جهاز جولجي"],
    explanationAr: "تنتج الميتوكوندريا ATP عبر التنفس الخلوي مما يوفر الطاقة للخلية",
  },
  {
    question: "What is the SI unit for electric current?",
    questionAr: "ما وحدة قياس التيار الكهربائي في النظام الدولي؟",
    optionsAr: ["الأمبير (A)", "الفولت (V)", "الأوم (Ω)", "الواط (W)"],
    explanationAr: "الأمبير هو وحدة النظام الدولي الأساسية لقياس التيار الكهربائي",
  },
  {
    question: "According to Mendel's law of segregation, what happens to alleles during gamete formation?",
    questionAr: "وفق قانون مندل للانفصال، ماذا يحدث للأليلات أثناء تكوّن الأمشاج؟",
    optionsAr: ["تنفصل بحيث يحصل كل مشيج على أليل واحد", "تتجمع معاً", "تتحور", "تتضاعف"],
    explanationAr: "ينص قانون الانفصال على أن الأليلات تنفصل عند تكوّن الأمشاج فيحصل كل مشيج على أليل واحد",
  },
  {
    question: "What is the voltage across a resistor with resistance 10 Ω carrying a current of 2 A? (Use Ohm's Law: V = IR)",
    questionAr: "ما الجهد عبر مقاومة مقدارها 10 أوم يمر بها تيار 2 أمبير؟ (استخدم قانون أوم: V = IR)",
    optionsAr: ["20 V", "5 V", "12 V", "0.2 V"],
    explanationAr: "بقانون أوم: V = IR = 2 × 10 = 20 فولت",
  },
  {
    question: "What is the process by which cells divide to produce gametes (sex cells)?",
    questionAr: "ما العملية التي تنقسم بها الخلايا لتكوين الأمشاج (الخلايا الجنسية)؟",
    optionsAr: ["الانقسام المنصف", "الانقسام المتساوي", "الانشطار الثنائي", "التبرعم"],
    explanationAr: "الانقسام المنصف هو الانقسام المتخصص الذي ينتج أمشاجاً بنصف عدد الكروموسومات",
  },

  // ═══════════════════════════════════════════════════════════════════
  // SCIENCE — GRADE 11
  // ═══════════════════════════════════════════════════════════════════
  {
    question: "What is the chemical symbol for gold?",
    questionAr: "ما الرمز الكيميائي للذهب؟",
    optionsAr: ["Au", "Ag", "Fe", "Cu"],
    explanationAr: "رمز الذهب Au مشتق من اسمه اللاتيني 'Aurum'",
  },
  {
    question: "What is kinetic energy?",
    questionAr: "ما الطاقة الحركية؟",
    optionsAr: ["طاقة الحركة", "الطاقة المخزنة", "الطاقة الحرارية", "الطاقة الضوئية"],
    explanationAr: "الطاقة الحركية هي الطاقة التي يمتلكها جسم بسبب حركته، وتُحسب بـ KE = ½mv²",
  },
  {
    question: "In a heterozygous individual (Aa), which allele is expressed in the phenotype?",
    questionAr: "في الفرد الهجين (Aa)، أيٌّ من الأليلات يظهر في النمط الظاهري؟",
    optionsAr: ["الأليل السائد", "الأليل المتنحي", "كلاهما بالتساوي", "لا شيء منهما"],
    explanationAr: "في الأفراد الهجينين، يُعبَّر عن الأليل السائد بينما يُحجب الأليل المتنحي",
  },
  {
    question: "What type of bond is formed when atoms share electrons?",
    questionAr: "ما نوع الرابطة التي تتكون عندما تتشارك الذرات الإلكترونات؟",
    optionsAr: ["رابطة تساهمية", "رابطة أيونية", "رابطة فلزية", "رابطة هيدروجينية"],
    explanationAr: "تتكون الرابطة التساهمية عندما تتشارك الذرات زوجاً أو أكثر من الإلكترونات",
  },
  {
    question: "A car accelerates from rest to 20 m/s in 5 seconds. What is its acceleration?",
    questionAr: "سيارة تتسارع من السكون إلى 20 م/ث خلال 5 ثوانٍ. ما تسارعها؟",
    optionsAr: ["4 m/s²", "100 m/s²", "25 m/s²", "15 m/s²"],
    explanationAr: "التسارع = (السرعة النهائية - السرعة الابتدائية) / الزمن = (20 - 0) / 5 = 4 م/ث²",
  },
  {
    question: "What is the balanced equation for the combustion of methane (CH₄)?",
    questionAr: "ما المعادلة الموزونة لاحتراق الميثان (CH₄)؟",
    optionsAr: ["CH₄ + 2O₂ → CO₂ + 2H₂O", "CH₄ + O₂ → CO₂ + H₂O", "CH₄ + 3O₂ → CO₂ + 2H₂O", "2CH₄ + O₂ → 2CO₂ + H₂O"],
    explanationAr: "احتراق الميثان: CH₄ + 2O₂ → CO₂ + 2H₂O. الذرات موزونة: 1C، 4H، 4O في كل طرف",
  },
  {
    question: "Which biome receives less than 25 cm of rain per year?",
    questionAr: "أيٌّ من المناطق الحيوية تتلقى أقل من 25 سم من المطر سنوياً؟",
    optionsAr: ["الصحراء", "الغابة المدارية المطيرة", "الغابة المعتدلة", "السافانا"],
    explanationAr: "تتميز الصحراء بهطول أمطار ضئيل جداً يقل عن 25 سم سنوياً",
  },

  // ═══════════════════════════════════════════════════════════════════
  // SCIENCE — GRADE 12
  // ═══════════════════════════════════════════════════════════════════
  {
    question: "What is the work done when a force of 15 N moves an object 4 meters in the direction of the force?",
    questionAr: "ما الشغل المبذول عندما تُحرّك قوة مقدارها 15 نيوتن جسماً مسافة 4 أمتار في اتجاه القوة؟",
    optionsAr: ["60 J", "19 J", "11 J", "3.75 J"],
    explanationAr: "الشغل = القوة × المسافة = 15 نيوتن × 4 م = 60 جول",
  },
  {
    question: "What is the molarity of a solution containing 2 moles of NaCl dissolved in 4 liters of water?",
    questionAr: "ما مولارية محلول يحتوي على 2 مول من كلوريد الصوديوم مذاباً في 4 لترات من الماء؟",
    optionsAr: ["0.5 M", "2 M", "8 M", "0.25 M"],
    explanationAr: "المولارية = مول المذاب / لترات المحلول = 2 مول / 4 لتر = 0.5 مولار",
  },
  {
    question: "In photosynthesis, what molecule is split to release oxygen?",
    questionAr: "في التمثيل الضوئي، أيٌّ من الجزيئات يتشقق لإطلاق الأكسجين؟",
    optionsAr: ["الماء (H₂O)", "ثاني أكسيد الكربون (CO₂)", "الجلوكوز (C₆H₁₂O₆)", "ATP"],
    explanationAr: "أثناء التفاعلات الضوئية، تتشقق جزيئات الماء (تحلل ضوئي) مُطلِقةً غاز الأكسجين",
  },
  {
    question: "Calculate the momentum of a 1500 kg car traveling at 20 m/s (momentum = mass × velocity)",
    questionAr: "احسب كمية الحركة لسيارة كتلتها 1500 كغ تسير بسرعة 20 م/ث (كمية الحركة = الكتلة × السرعة)",
    optionsAr: ["30000 kg⋅m/s", "1520 kg⋅m/s", "75 kg⋅m/s", "1480 kg⋅m/s"],
    explanationAr: "كمية الحركة = الكتلة × السرعة = 1500 كغ × 20 م/ث = 30000 كغ⋅م/ث",
  },
  {
    question: "What happens to the equilibrium of the reaction N₂ + 3H₂ ⇌ 2NH₃ if pressure is increased?",
    questionAr: "ماذا يحدث لاتزان التفاعل N₂ + 3H₂ ⇌ 2NH₃ إذا زاد الضغط؟",
    optionsAr: ["ينتقل يميناً (نحو إنتاج NH₃)", "ينتقل يساراً (نحو المتفاعلات)", "لا تغيير", "يتوقف التفاعل"],
    explanationAr: "وفق مبدأ لو شاتليه، يُزيح ضغط متزايد الاتزان نحو الجانب الأقل عدداً من الجزيئات الغازية (4 مول → 2 مول)",
  },
  {
    question: "A wave has a frequency of 500 Hz and travels at 1500 m/s. What is its wavelength?",
    questionAr: "موجة تردّدها 500 هرتز وتنتقل بسرعة 1500 م/ث. ما طولها الموجي؟",
    optionsAr: ["3 m", "0.33 m", "750000 m", "1000 m"],
    explanationAr: "طول الموجة = السرعة / التردد = 1500 م/ث ÷ 500 هرتز = 3 م",
  },

  // ═══════════════════════════════════════════════════════════════════
  // ENGLISH — GRADE 9
  // ═══════════════════════════════════════════════════════════════════
  {
    question: "In the sentence 'The dog barked loudly,' what is 'loudly'?",
    questionAr: "في الجملة 'نبح الكلب بصوت عالٍ'، ما وظيفة 'بصوت عالٍ'؟",
    optionsAr: ["ظرف (حال)", "صفة", "اسم", "فعل"],
    explanationAr: "'Loudly' ظرف يصف كيفية نباح الكلب (يعدّل الفعل 'barked')",
  },
  {
    question: "Which literary device gives human qualities to non-human things?",
    questionAr: "أيٌّ من الأدوات الأدبية يمنح صفات إنسانية لأشياء غير إنسانية؟",
    optionsAr: ["التجسيد", "التشبيه", "المبالغة", "الجناس"],
    explanationAr: "التجسيد يمنح الحيوانات والأشياء والأفكار سمات بشرية (مثل: 'همست الريح')",
  },
  {
    question: "What is the correct past tense of 'run'?",
    questionAr: "ما الصيغة الصحيحة للماضي للفعل 'run'؟",
    optionsAr: ["Ran", "Runned", "Running", "Runs"],
    explanationAr: "الفعل 'run' شاذ وصيغة ماضيه 'ran'",
  },
  {
    question: "Which word is an antonym for 'expand'?",
    questionAr: "أيٌّ من الكلمات التالية مضاد لـ 'expand' (يتسع)؟",
    optionsAr: ["Contract (ينكمش)", "Grow (ينمو)", "Enlarge (يكبّر)", "Increase (يزيد)"],
    explanationAr: "'Contract' تعني الانكماش فهي عكس 'expand'",
  },
  {
    question: "In a narrative, what is the 'climax'?",
    questionAr: "في القصص السردية، ما الذروة 'climax'؟",
    optionsAr: ["نقطة التوتر الأعلى أو نقطة التحول", "تقديم الشخصيات", "نهاية القصة", "الخلفية والمعلومات"],
    explanationAr: "الذروة هي أشد لحظات القصة توتراً حيث يبلغ الصراع الرئيسي قمته",
  },
  {
    question: "Which sentence uses a simile?",
    questionAr: "أيٌّ من الجمل تستخدم تشبيهاً صريحاً؟",
    optionsAr: ["ابتسامتها كانت مشرقةً كالشمس.", "ابتسامتها أضاءت الغرفة.", "ابتسمت بسعادة.", "كانت الغرفة مضيئة."],
    explanationAr: "التشبيه يقارن بين شيئين باستخدام 'مثل' أو 'كـ'",
  },
  {
    question: "What is the subject in the sentence: 'After school, the students played football'?",
    questionAr: "ما الفاعل في الجملة: 'After school, the students played football'؟",
    optionsAr: ["The students (الطلاب)", "After school (بعد المدرسة)", "Played (لعبوا)", "Football (كرة القدم)"],
    explanationAr: "الفاعل هو من يقوم بالفعل. 'The students' هو الفاعل الذي يقوم بالفعل",
  },
  {
    question: "Which transition word shows contrast?",
    questionAr: "أيٌّ من الكلمات الرابطة التالية يدل على التناقض؟",
    optionsAr: ["However (غير أن)", "Furthermore (علاوة على ذلك)", "Therefore (لذلك)", "Similarly (بالمثل)"],
    explanationAr: "'However' كلمة رابطة تقدّم فكرة مناقضة أو وجهة نظر معاكسة",
  },
  {
    question: "What is the main difference between a fact and an opinion?",
    questionAr: "ما الفرق الرئيسي بين الحقيقة والرأي؟",
    optionsAr: ["الحقائق يمكن إثباتها، الآراء معتقدات شخصية", "الحقائق دائماً أطول", "الآراء تستخدم صفات أكثر", "الحقائق من الكتب فقط"],
    explanationAr: "الحقائق عبارات يمكن التحقق منها، بينما الآراء معتقدات أو أحكام شخصية",
  },
  {
    question: "Which sentence correctly uses a compound sentence structure?",
    questionAr: "أيٌّ من الجمل يستخدم تركيب الجملة المركبة (المضمومة) بشكل صحيح؟",
    optionsAr: ["أردت الذهاب إلى الحديقة، لكن كانت تمطر.", "الذهاب إلى الحديقة.", "الحديقة كانت مغلقة.", "ذهبت إلى الحديقة والمول والمكتبة."],
    explanationAr: "الجملة المركبة تصل بين جملتين مستقلتين بأداة عطف تنسيقية (but, and, or, so)",
  },

  // ═══════════════════════════════════════════════════════════════════
  // ENGLISH — GRADE 10
  // ═══════════════════════════════════════════════════════════════════
  {
    question: "In which type of text would you most likely find persuasive language and rhetorical questions?",
    questionAr: "في أيٍّ من أنواع النصوص تجد غالباً لغة إقناعية وأسئلة بلاغية؟",
    optionsAr: ["مقال جدلي (حجاجي)", "قصة سردية", "إدخال معجمي", "تقرير مختبر"],
    explanationAr: "تستخدم المقالات الجدلية أساليب الإقناع كالأسئلة البلاغية لإقناع القارئ",
  },
  {
    question: "What does the prefix 'anti-' mean in words like 'antibiotic' and 'antisocial'?",
    questionAr: "ماذا تعني السابقة 'anti-' في كلمات كـ 'antibiotic' و 'antisocial'؟",
    optionsAr: ["ضد أو عكس", "قبل", "معاً", "حول"],
    explanationAr: "'Anti-' سابقة تعني ضد أو عكس (antibiotic = ضد البكتيريا)",
  },
  {
    question: "Which sentence uses a semicolon correctly?",
    questionAr: "أيٌّ من الجمل تستخدم الفاصلة المنقوطة بشكل صحيح؟",
    optionsAr: ["أحب القراءة؛ إنها تساعدني على الاسترخاء.", "أحب؛ قراءة الكتب.", "القراءة ممتعة؛ ومفيدة.", "الكتاب؛ كان مثيراً."],
    explanationAr: "تربط الفاصلة المنقوطة بين جملتين مستقلتين متعلقتين دون أداة عطف",
  },
  {
    question: "What literary device is used in: 'The classroom was a zoo'?",
    questionAr: "ما الأسلوب البلاغي المستخدم في: 'The classroom was a zoo' (كانت الفصل حديقة حيوان)؟",
    optionsAr: ["استعارة", "تشبيه", "تجسيد", "جناس"],
    explanationAr: "الاستعارة تصف شيئاً مباشرةً بأنه شيء آخر لإجراء مقارنة",
  },
  {
    question: "In critical reading, what does it mean to 'infer'?",
    questionAr: "في القراءة النقدية، ماذا يعني 'الاستنتاج'؟",
    optionsAr: ["استخلاص نتائج بناءً على الأدلة والتفكير", "حفظ النص", "تلخيص النقاط الرئيسية", "نسخ كلمات المؤلف"],
    explanationAr: "الاستنتاج يعني استخدام القرائن في النص مع المعرفة الشخصية للتوصل إلى استنتاجات",
  },
  {
    question: "What is a 'theme' in literature?",
    questionAr: "ما 'الموضوع' في الأدب؟",
    optionsAr: ["الرسالة المحورية أو البصيرة حول الحياة", "الإطار المكاني للقصة", "الشخصية الرئيسية", "ملخص الحبكة"],
    explanationAr: "الموضوع هو الفكرة أو الرسالة الكونية الكامنة التي يستكشفها المؤلف في عمله",
  },
  {
    question: "Which sentence demonstrates correct subject-verb agreement?",
    questionAr: "أيٌّ من الجمل تُظهر توافقاً صحيحاً بين الفاعل والفعل؟",
    optionsAr: ["الفريق مستعد.", "الفريق مستعدون.", "الفريق مستعد.", "الفريق كان مستعداً."],
    explanationAr: "الأسماء الجمعية كـ 'team' تأخذ فعلاً مفرداً عند عملها كوحدة واحدة",
  },
  {
    question: "Which sentence correctly uses a compound sentence structure?",
    questionAr: "أيٌّ من الجمل تستخدم تركيب الجملة المضمومة بشكل صحيح؟",
    optionsAr: ["أردت الذهاب للحديقة لكن كانت تمطر.", "الذهاب للحديقة.", "الحديقة كانت مغلقة.", "ذهبت للحديقة والمول والمكتبة."],
    explanationAr: "الجملة المضمومة تصل جملتين مستقلتين بأداة عطف تنسيقية",
  },

  // ═══════════════════════════════════════════════════════════════════
  // ENGLISH — GRADE 11
  // ═══════════════════════════════════════════════════════════════════
  {
    question: "What does 'chronological order' mean in writing?",
    questionAr: "ماذا يعني 'الترتيب الزمني' في الكتابة؟",
    optionsAr: ["مرتب وفق تسلسل زمني", "مرتب وفق الأهمية", "مرتب أبجدياً", "مرتب وفق الموضوع"],
    explanationAr: "الترتيب الزمني يعني ترتيب الأحداث وفق تسلسل وقوعها في الزمن",
  },
  {
    question: "Which word is correctly spelled?",
    questionAr: "أيٌّ من الكلمات التالية مكتوبة إملاءً صحيحاً؟",
    optionsAr: ["Accommodate", "Acommodate", "Accomodate", "Acomodate"],
    explanationAr: "'Accommodate' تحتوي على حرفَي c وحرفَي m - وهي من الكلمات كثيرة الأخطاء الإملائية",
  },
  {
    question: "What is the purpose of a counterargument in an argumentative essay?",
    questionAr: "ما الغرض من الحجة المضادة في المقال الجدلي؟",
    optionsAr: ["الإقرار بالآراء المعارضة والرد عليها", "إرباك القارئ", "تغيير موقفك", "إنهاء المقال"],
    explanationAr: "الحجج المضادة تقوي مقالك بإظهار أنك أخذت وجهات نظر أخرى بعين الاعتبار وتستطيع الدفاع عن موقفك",
  },
  {
    question: "What is 'irony' in literature?",
    questionAr: "ما 'السخرية/المفارقة' في الأدب؟",
    optionsAr: ["تناقض بين التوقع والواقع", "مقارنة بـ 'مثل' أو 'كـ'", "تكرار الأصوات الأولى", "مبالغة شديدة"],
    explanationAr: "المفارقة تحدث حين يختلف ما يقع عما هو متوقع أو حين يختلف المعنى الظاهر عن الحقيقي",
  },
  {
    question: "Which sentence uses parallel structure correctly?",
    questionAr: "أيٌّ من الجمل تستخدم التوازي الهيكلي بشكل صحيح؟",
    optionsAr: ["تستمتع بالقراءة والكتابة والمشي.", "تستمتع بالقراءة والكتابة والمشي.", "تستمتع بالقراءة والكتابة والمشي.", "تستمتع بالقراءة والكتابة والمشي."],
    explanationAr: "التوازي الهيكلي يستخدم الصيغة النحوية ذاتها للعناصر المتعاقبة",
  },
  {
    question: "What is the difference between 'its' and 'it's'?",
    questionAr: "ما الفرق بين 'its' و 'it's'؟",
    optionsAr: ["'Its' تدل على الملكية؛ 'it's' تعني 'it is'", "'Its' تعني 'it is'؛ 'it's' تدل على الملكية", "كلتاهما متبادلتان", "كلتاهما تدلان على الملكية"],
    explanationAr: "'Its' ضمير ملكية (ضرب الكلب ذيله)، أما 'it's' فاختصار لـ 'it is' أو 'it has'",
  },
  {
    question: "What is 'tone' in writing?",
    questionAr: "ما 'النبرة/الأسلوب' في الكتابة؟",
    optionsAr: ["موقف المؤلف تجاه الموضوع", "الفكرة الرئيسية", "نوع الكتابة", "طول الجمل"],
    explanationAr: "النبرة تعكس موقف المؤلف أو مشاعره من خلال اختيار الكلمات والأسلوب",
  },

  // ═══════════════════════════════════════════════════════════════════
  // ENGLISH — GRADE 12
  // ═══════════════════════════════════════════════════════════════════
  {
    question: "Which citation style is commonly used for humanities subjects?",
    questionAr: "أيٌّ من أساليب التوثيق يُستخدم عادةً في مواد الإنسانيات؟",
    optionsAr: ["MLA", "APA", "Chicago", "IEEE"],
    explanationAr: "أسلوب MLA (جمعية اللغات الحديثة) يُستخدم عادةً في اللغة الإنجليزية والأدب وعلوم الإنسانيات",
  },
  {
    question: "What is a 'complex sentence'?",
    questionAr: "ما 'الجملة المركبة (المعقدة)'؟",
    optionsAr: ["جملة تحتوي على جملة مستقلة وجملة تابعة واحدة أو أكثر", "جملة طويلة جداً", "جملة تحتوي على جملتين مستقلتين", "جملة تحتوي على صفات متعددة"],
    explanationAr: "الجملة المركبة المعقدة تضم جملة مستقلة وجملة أو أكثر تابعة مرتبطة بأدوات عطف تبعية",
  },
  {
    question: "In Shakespeare's plays, what is a 'soliloquy'?",
    questionAr: "في مسرحيات شكسبير، ما 'المناجاة'؟",
    optionsAr: ["خطاب شخصية منفردة على المسرح تكشف أفكارها الداخلية", "حوار بين شخصيتين", "المشهد الافتتاحي", "أغنية يؤديها الكورس"],
    explanationAr: "المناجاة حين تتحدث الشخصية منفردةً كاشفةً أفكارها ومشاعرها للجمهور",
  },
  {
    question: "Which phrase contains a dangling modifier? ",
    questionAr: "أيٌّ من العبارات تحتوي على وصف معلّق (dangling modifier)؟",
    optionsAr: ["وأنا أسير إلى المدرسة، بدأ المطر يهطل.", "بينما كنت أسير إلى المدرسة، ابتللت من المطر.", "هطل المطر وأنا أسير إلى المدرسة.", "كنت أسير إلى المدرسة حين أمطرت."],
    explanationAr: "هذا وصف معلّق لأن 'وأنا أسير إلى المدرسة' يصف منطقياً 'المطر' لا شخصاً",
  },
  {
    question: "What is the primary purpose of a literature review in research writing?",
    questionAr: "ما الغرض الأساسي من مراجعة الأدبيات في الكتابة البحثية؟",
    optionsAr: ["تلخيص الأبحاث القائمة وتحليلها", "إبداء الآراء الشخصية", "كتابة قصص خيالية", "سرد حقائق عشوائية"],
    explanationAr: "مراجعة الأدبيات تفحص المصادر العلمية لتحديد ما هو معروف مسبقاً حول موضوع ما",
  },
  {
    question: "What is 'syntax' in language study?",
    questionAr: "ما 'النحو/التركيب' في دراسة اللغة؟",
    optionsAr: ["ترتيب الكلمات لتكوين جمل", "معنى الكلمات", "أصل الكلمات", "نطق الكلمات"],
    explanationAr: "التركيب يشير إلى القواعد التي تحكم طريقة ترتيب الكلمات لتكوين جمل ذات معنى",
  },

  // ═══════════════════════════════════════════════════════════════════
  // ARABIC — GRADE 9
  // ═══════════════════════════════════════════════════════════════════
  {
    question: "Which verb means 'to read' in Arabic?",
    questionAr: "أيٌّ من الأفعال يعني 'يقرأ' في العربية؟",
    optionsAr: ["قرأ", "كتب", "درس", "سمع"],
    explanationAr: "قرأ (qara'a) تعني 'قرأ' باللغة العربية",
  },
  {
    question: "What is the past tense of (يذهب) 'he goes'?",
    questionAr: "ما الصيغة الماضية للفعل (يذهب)؟",
    optionsAr: ["ذهب", "ذاهب", "يذهب", "سيذهب"],
    explanationAr: "ذهب هي صيغة الماضي وتعني 'he went'",
  },
  {
    question: "Which preposition means 'in' or 'at' in Arabic?",
    questionAr: "أيٌّ من حروف الجر يعني 'في' أو 'عند' في العربية؟",
    optionsAr: ["في", "على", "من", "إلى"],
    explanationAr: "في (fī) حرف جر يفيد الظرفية",
  },
  {
    question: "How do you say 'Thank you' in Arabic?",
    questionAr: "كيف تقول 'شكراً' في العربية؟",
    optionsAr: ["شكراً", "مرحباً", "أهلاً", "من فضلك"],
    explanationAr: "شكراً (shukran) تعني 'Thank you' في العربية",
  },
  {
    question: "What is the plural of (معلم) 'teacher'?",
    questionAr: "ما جمع كلمة (معلم)؟",
    optionsAr: ["معلمون", "معلمين", "معلمان", "معلمة"],
    explanationAr: "معلمون هو جمع المذكر السالم (حالة الرفع) لكلمة معلم",
  },
  {
    question: "Which sentence structure is correct in Arabic nominal sentences (الجملة الاسمية)?",
    questionAr: "ما البناء الصحيح للجملة الاسمية في العربية؟",
    optionsAr: ["المبتدأ + الخبر", "فعل + فاعل + مفعول به", "مفعول به + فعل + فاعل", "خبر + فعل + مبتدأ"],
    explanationAr: "تبدأ الجملة الاسمية في العربية بالمبتدأ يليه الخبر",
  },
  {
    question: "What does (حديقة) mean?",
    questionAr: "ماذا تعني كلمة (حديقة)؟",
    optionsAr: ["حديقة/منتزه", "شارع", "مبنى", "سيارة"],
    explanationAr: "حديقة (ḥadīqah) تعني 'garden' أو 'park'",
  },
  {
    question: "Which pronoun means 'they' (masculine) in Arabic?",
    questionAr: "أيٌّ من الضمائر يعني 'هم' (للمذكر) في العربية؟",
    optionsAr: ["هم", "هن", "نحن", "أنتم"],
    explanationAr: "هم (hum) ضمير الغائبين للمذكر أو للمجموعة المختلطة",
  },
  {
    question: "In the phrase (كتاب الطالب) 'the student's book', what grammatical relationship is shown?",
    questionAr: "في عبارة (كتاب الطالب)، ما العلاقة النحوية الظاهرة؟",
    optionsAr: ["إضافة", "فعل وفاعل", "نعت ومنعوت", "حال"],
    explanationAr: "هذه إضافة، وهي تركيب تمليكي يربط بين اسمين",
  },
  {
    question: "What does (مكتبة) mean in Arabic?",
    questionAr: "ماذا تعني (مكتبة) في العربية؟",
    optionsAr: ["مكتبة", "مكتب", "مكتب عمل", "مكتبة للبيع فقط"],
    explanationAr: "مكتبة (maktabah) تعني أساساً 'library' وقد تعني أيضاً 'bookstore'",
  },

  // ═══════════════════════════════════════════════════════════════════
  // ARABIC — GRADE 10
  // ═══════════════════════════════════════════════════════════════════
  {
    question: "What is the مصدر (masdar/verbal noun) of the verb (كتب) 'to write'?",
    questionAr: "ما مصدر الفعل (كتب)؟",
    optionsAr: ["كتابة", "مكتوب", "كاتب", "كتب"],
    explanationAr: "مصدر الفعل (كتب) هو (كتابة)",
  },
  {
    question: "Which is the correct passive voice form of (قرأ الطالب الكتاب) 'The student read the book'?",
    questionAr: "ما صيغة المبني للمجهول الصحيحة لجملة (قرأ الطالب الكتاب)؟",
    optionsAr: ["قُرِئَ الكتاب", "قرأ الكتاب", "يقرأ الكتاب", "قارئ الكتاب"],
    explanationAr: "في المبني للمجهول يتغير وزن الفعل ويصبح المفعول به نائباً للفاعل",
  },
  {
    question: "In Arabic poetry, what is (البحر) al-bahr?",
    questionAr: "في الشعر العربي، ما (البحر)؟",
    optionsAr: ["نمط الوزن والإيقاع", "البحر/المحيط", "نظام القافية", "الموضوع"],
    explanationAr: "يشير البحر في العروض العربي إلى النمط الإيقاعي للقصيدة",
  },
  {
    question: "What does (التشبيه) at-tashbīh mean in Arabic rhetoric?",
    questionAr: "ماذا يعني (التشبيه) في البلاغة العربية؟",
    optionsAr: ["تشبيه/مقارنة", "استعارة", "مبالغة", "تجسيد"],
    explanationAr: "التشبيه أسلوب بلاغي يستخدم المقارنة الصريحة بـ 'مثل' أو 'كـ'",
  },
  {
    question: "Which case ending is used for the subject (فاعل) in Arabic?",
    questionAr: "ما حركة الإعراب المستخدمة للفاعل في العربية؟",
    optionsAr: ["الرفع", "النصب", "الجر", "الجزم"],
    explanationAr: "الفاعل يأخذ دائماً علامة الرفع",
  },
  {
    question: "What is the اسم الفاعل (active participle) of (درس) 'to study'?",
    questionAr: "ما اسم الفاعل من الفعل (درس)؟",
    optionsAr: ["دارس", "مدروس", "درس", "يدرس"],
    explanationAr: "اسم الفاعل من (درس) هو (دارس) بمعنى 'طالب / من يدرس'",
  },
  {
    question: "Which verb form (وزن) is (استخرج) from?",
    questionAr: "من أي وزن (باب) الفعل (استخرج)؟",
    optionsAr: ["استفعل (الباب العاشر)", "أفعل (الباب الرابع)", "فعّل (الباب الثاني)", "انفعل (الباب السابع)"],
    explanationAr: "استخرج على وزن استفعل (الباب العاشر) ومعناها 'يستخرج'",
  },

  // ═══════════════════════════════════════════════════════════════════
  // ARABIC — GRADE 11
  // ═══════════════════════════════════════════════════════════════════
  {
    question: "What is the opposite of (الاستعارة) al-isti'ārah (metaphor) in Arabic rhetoric?",
    questionAr: "ما مقابل (الاستعارة) في البلاغة العربية؟",
    optionsAr: ["الحقيقة", "المجاز", "الكناية", "الجناس"],
    explanationAr: "الحقيقة (المعنى الحرفي) هي مقابل الاستعارة (المعنى المجازي)",
  },
  {
    question: "What does (الجملة الفعلية) mean in Arabic grammar?",
    questionAr: "ماذا تعني (الجملة الفعلية) في النحو العربي؟",
    optionsAr: ["جملة تبدأ بفعل", "جملة اسمية", "جملة استفهامية", "جملة شرطية"],
    explanationAr: "الجملة الفعلية هي الجملة التي تبدأ بفعل",
  },
  {
    question: "In the word (مُسْتَشْفَى), what is the grammatical pattern?",
    questionAr: "ما الوزن الصرفي لكلمة (مُسْتَشْفَى)؟",
    optionsAr: ["مُسْتَفْعَل (اسم مكان من الباب العاشر)", "مَفْعَل (اسم مكان بسيط)", "فاعل (اسم فاعل)", "مفعول (اسم مفعول)"],
    explanationAr: "(مُسْتَشْفَى) بمعنى المستشفى على وزن مُسْتَفْعَل اسم مكان من الباب العاشر (استشفى)",
  },
  {
    question: "What is (الطباق) at-tibāq in Arabic rhetoric?",
    questionAr: "ما (الطباق) في البلاغة العربية؟",
    optionsAr: ["الجمع بين المتضادات", "التشبيه", "التكرار", "المبالغة"],
    explanationAr: "الطباق أسلوب بلاغي يجمع بين الكلمات المتضادة في الجملة ذاتها",
  },
  {
    question: "Which is the correct اسم المفعول (passive participle) of (كتب)?",
    questionAr: "ما اسم المفعول الصحيح من الفعل (كتب)؟",
    optionsAr: ["مكتوب", "كاتب", "كتابة", "يكتب"],
    explanationAr: "اسم المفعول من (كتب) هو (مكتوب) بمعنى 'written'",
  },
  {
    question: "What is the feminine plural form of (مسلم) 'Muslim (male)'?",
    questionAr: "ما جمع المؤنث لكلمة (مسلم)؟",
    optionsAr: ["مسلمات", "مسلمون", "مسلمتان", "مسلمين"],
    explanationAr: "جمع المؤنث السالم لكلمة (مسلم) هو (مسلمات)",
  },
  {
    question: "In Arabic morphology, what does (الميزان الصرفي) mean?",
    questionAr: "ماذا يعني (الميزان الصرفي) في الصرف العربي؟",
    optionsAr: ["النمط الصرفي باستخدام ف-ع-ل", "الحالة الإعرابية", "تركيب الجملة", "تصريف الفعل"],
    explanationAr: "الميزان الصرفي هو النمط القياسي الذي يستخدم جذر ف-ع-ل لبيان أوزان الكلمات",
  },

  // ═══════════════════════════════════════════════════════════════════
  // ARABIC — GRADE 12
  // ═══════════════════════════════════════════════════════════════════
  {
    question: "What is (الممنوع من الصرف) in Arabic grammar?",
    questionAr: "ما (الممنوع من الصرف) في النحو العربي؟",
    optionsAr: ["الاسم الذي لا يُنوَّن (الدبتوت)", "الفعل في المبني للمجهول", "جمع التكسير", "صيغة المثنى"],
    explanationAr: "الممنوع من الصرف اسم لا يقبل التنوين لأسباب صرفية محددة",
  },
  {
    question: "Who is considered the father of Arabic poetry?",
    questionAr: "من يُعدّ أبا الشعر العربي؟",
    optionsAr: ["امرؤ القيس", "أبو نواس", "المتنبي", "أحمد شوقي"],
    explanationAr: "يُعدّ امرؤ القيس من أعظم شعراء ما قبل الإسلام ويُلقَّب بأبي الشعر العربي",
  },
  {
    question: "What is the function of (إن وأخواتها) in Arabic?",
    questionAr: "ما وظيفة (إن وأخواتها) في النحو العربي؟",
    optionsAr: ["تنصب المبتدأ ويسمى اسمها", "تجزم الفعل", "تكوّن جملاً شرطية", "تُكوّن الأسئلة"],
    explanationAr: "إن وأخواتها حروف تنصب المبتدأ (يسمى اسمها) وترفع الخبر (يسمى خبرها)",
  },
  {
    question: "What is (السجع) as-saj' in Arabic prose?",
    questionAr: "ما (السجع) في النثر العربي؟",
    optionsAr: ["النثر المقفّى", "الشعر الحر", "الشعر الأبيض", "الشعر الملحمي"],
    explanationAr: "السجع أسلوب بلاغي في النثر العربي حيث تنتهي العبارات بالصوت أو القافية ذاتها",
  },
  {
    question: "In the conditional sentence (إن تدرس تنجح), what type of conditional is (إن)?",
    questionAr: "في الجملة الشرطية (إن تدرس تنجح)، ما نوع (إن)؟",
    optionsAr: ["جازمة", "غير جازمة", "استفهامية", "نافية"],
    explanationAr: "(إن) أداة شرط جازمة تجزم فعلَي الشرط والجواب",
  },
  {
    question: "What is (التشبيه) at-tashbīh in Arabic rhetoric?",
    questionAr: "ما (التشبيه) في البلاغة العربية؟",
    optionsAr: ["تشبيه/مقارنة", "استعارة", "تجسيد", "جناس"],
    explanationAr: "التشبيه أسلوب بلاغي يقارن بين شيئين باستخدام أدوات المقارنة كـ 'كـ' أو 'مثل'",
  },

  // ═══════════════════════════════════════════════════════════════════
  // SOCIAL STUDIES — GRADE 9
  // ═══════════════════════════════════════════════════════════════════
  {
    question: "Which mountain range is located in the northern emirates?",
    questionAr: "أيٌّ من سلاسل الجبال يقع في الإمارات الشمالية؟",
    optionsAr: ["جبال الحجر", "جبال الأطلس", "جبال زاغروس", "جبال طوروس"],
    explanationAr: "تمتد جبال الحجر عبر الإمارات الشمالية بما فيها رأس الخيمة والفجيرة",
  },
  {
    question: "What is the significance of National Day in the UAE?",
    questionAr: "ما أهمية اليوم الوطني في الإمارات العربية المتحدة؟",
    optionsAr: ["يحتفل بتوحيد الإمارات السبع", "يُحيي ذكرى الاستقلال عن بريطانيا", "يحتفل باكتشاف النفط", "يُحيي أول انتخابات"],
    explanationAr: "يُحيي اليوم الوطني في الثاني من ديسمبر ذكرى توحيد الإمارات السبع عام 1971",
  },
  {
    question: "Which emirate is the only one located entirely on the Gulf of Oman coast?",
    questionAr: "أيٌّ من الإمارات يقع بأكمله على ساحل خليج عُمان؟",
    optionsAr: ["الفجيرة", "رأس الخيمة", "الشارقة", "عجمان"],
    explanationAr: "الفجيرة هي الإمارة الوحيدة التي تقع بأكملها على الساحل الشرقي المطل على خليج عُمان",
  },
  {
    question: "What was the primary purpose of the 'Trucial States' agreement in the 19th century?",
    questionAr: "ما الغرض الأساسي من اتفاقية 'الدول المتصالحة' في القرن التاسع عشر؟",
    optionsAr: ["صون السلام وحماية التجارة البحرية", "اكتشاف النفط", "بناء المدارس", "تطوير السياحة"],
    explanationAr: "هدفت معاهدات الدول المتصالحة مع بريطانيا إلى ضمان السلام البحري وحماية طرق التجارة",
  },
  {
    question: "What is the traditional Emirati dance performed at celebrations?",
    questionAr: "ما الرقصة الإماراتية التقليدية التي تُؤدَّى في الاحتفالات؟",
    optionsAr: ["العيالة", "الدبكة", "التنورة", "السامري"],
    explanationAr: "العيالة رقصة بدوية تقليدية تُؤدَّى في المناسبات والأحداث الوطنية",
  },
  {
    question: "Which organization did the UAE join in 1971, soon after its formation?",
    questionAr: "أيٌّ من المنظمات انضمت إليها الإمارات عام 1971 بُعيد تأسيسها؟",
    optionsAr: ["الأمم المتحدة وجامعة الدول العربية", "الاتحاد الأوروبي", "حلف الناتو", "آسيان"],
    explanationAr: "انضمت الإمارات إلى الأمم المتحدة وجامعة الدول العربية في ديسمبر 1971",
  },
  {
    question: "What climate type characterizes most of the UAE?",
    questionAr: "ما نوع المناخ السائد في معظم الإمارات؟",
    optionsAr: ["مناخ صحراوي حار", "غابة مدارية مطيرة", "مناخ متوسطي", "مناخ معتدل"],
    explanationAr: "تتميز الإمارات بمناخ صحراوي حار مع صيف شديد الحرارة وشتاء معتدل، ما عدا المناطق الجبلية",
  },
  {
    question: "Which value is considered fundamental to Emirati culture?",
    questionAr: "أيٌّ من القيم يُعدّ أساسياً في الثقافة الإماراتية؟",
    optionsAr: ["الضيافة والتسامح", "الفردية", "التنافس", "العزلة"],
    explanationAr: "الضيافة والتسامح واحترام الآخرين قيم جوهرية في الثقافة والمجتمع الإماراتي",
  },
  {
    question: "How has the UAE's approach to economic development changed since the 1970s?",
    questionAr: "كيف تغيّر نهج الإمارات في التنمية الاقتصادية منذ السبعينيات؟",
    optionsAr: ["التنويع من النفط إلى قطاعات متعددة", "التركيز الكامل على النفط", "التخلي عن جميع الصناعات", "العودة إلى صيد اللؤلؤ"],
    explanationAr: "نوّعت الإمارات اقتصادها بشكل استراتيجي نحو السياحة والتجارة والمال والتكنولوجيا وغيرها",
  },
  {
    question: "Why is tolerance considered an important national value in the UAE?",
    questionAr: "لماذا يُعدّ التسامح قيمة وطنية مهمة في الإمارات؟",
    optionsAr: ["لتعزيز التعايش السلمي بين الثقافات والأديان المتنوعة", "لاستقطاب السياح فقط", "بمتطلبات أممية", "لزيادة صادرات النفط"],
    explanationAr: "تُروّج الإمارات للتسامح لضمان الانسجام بين سكانها المتنوعين الذين يمثلون أكثر من 200 جنسية",
  },

  // ═══════════════════════════════════════════════════════════════════
  // SOCIAL STUDIES — GRADE 10
  // ═══════════════════════════════════════════════════════════════════
  {
    question: "What is UAE Vision 2071's primary goal?",
    questionAr: "ما الهدف الأساسي لرؤية الإمارات 2071؟",
    optionsAr: ["جعل الإمارات أفضل دولة في العالم بحلول 2071", "إلغاء الاعتماد على النفط بحلول 2050", "استعمار المريخ بحلول 2071", "أن تصبح أكبر اقتصاد في الشرق الأوسط"],
    explanationAr: "يهدف مئوية الإمارات 2071 إلى جعلها أفضل دولة في العالم بحلول ذكراها المئوية",
  },
  {
    question: "Which sector is NOT a priority in UAE Vision 2071?",
    questionAr: "أيٌّ من القطاعات ليس من أولويات رؤية الإمارات 2071؟",
    optionsAr: ["الزراعة التقليدية", "الذكاء الاصطناعي", "استكشاف الفضاء", "الطاقة المتجددة"],
    explanationAr: "تُولي رؤية الإمارات 2071 الأولوية للذكاء الاصطناعي والفضاء والطاقة النظيفة لا للزراعة التقليدية",
  },
  {
    question: "What percentage of clean energy does the UAE aim to achieve by 2050?",
    questionAr: "ما النسبة المستهدفة للطاقة النظيفة في الإمارات بحلول 2050؟",
    optionsAr: ["50%", "100%", "75%", "25%"],
    explanationAr: "تستهدف استراتيجية الإمارات للطاقة 2050 تحقيق 50% من الطاقة النظيفة",
  },
  {
    question: "Which UAE space mission successfully reached Mars in 2021?",
    questionAr: "أيٌّ من مهمات الفضاء الإماراتية وصلت إلى المريخ بنجاح عام 2021؟",
    optionsAr: ["مسبار الأمل", "مركبة راشد", "مشروع المريخ 2117", "مهمة الإمارات للمريخ"],
    explanationAr: "دخل مسبار الأمل مدار المريخ بنجاح في فبراير 2021",
  },
  {
    question: "What is the primary resource that historically drove the UAE economy before oil discovery?",
    questionAr: "ما المورد الأساسي الذي كان يُحرّك اقتصاد الإمارات تاريخياً قبل اكتشاف النفط؟",
    optionsAr: ["صيد اللؤلؤ والتجارة", "الزراعة", "السياحة", "التصنيع"],
    explanationAr: "قبل النفط، اعتمد اقتصاد الإمارات اعتماداً كبيراً على صيد اللؤلؤ والصيد والتجارة البحرية",
  },
  {
    question: "What is the name of the UAE's first nuclear power plant?",
    questionAr: "ما اسم أول محطة للطاقة النووية في الإمارات؟",
    optionsAr: ["محطة براكة للطاقة النووية", "محطة الإمارات النووية", "محطة أبوظبي للطاقة", "منشأة المكتوم النووية"],
    explanationAr: "محطة براكة للطاقة النووية هي أول محطة للطاقة النووية السلمية في العالم العربي",
  },
  {
    question: "Which initiative aims to prepare the UAE for the Fourth Industrial Revolution?",
    questionAr: "أيٌّ من المبادرات يهدف إلى تهيئة الإمارات للثورة الصناعية الرابعة؟",
    optionsAr: ["استراتيجية الإمارات للذكاء الاصطناعي", "الاستراتيجية الصناعية 2020", "خطة تصدير النفط", "مبادرة التصنيع التقليدي"],
    explanationAr: "تهدف استراتيجية الإمارات للذكاء الاصطناعي إلى جعلها رائدةً عالمياً في هذا المجال بحلول 2031",
  },

  // ═══════════════════════════════════════════════════════════════════
  // SOCIAL STUDIES — GRADE 11
  // ═══════════════════════════════════════════════════════════════════
  {
    question: "What was the significance of the Abraham Accords for the UAE?",
    questionAr: "ما أهمية اتفاقيات أبراهام بالنسبة للإمارات؟",
    optionsAr: ["تطبيع العلاقات مع إسرائيل", "الانضمام إلى الاتحاد الأوروبي", "اكتشاف حقول نفط جديدة", "استضافة الألعاب الأولمبية"],
    explanationAr: "اتفاقيات أبراهام (2020) أقامت علاقات دبلوماسية بين الإمارات وإسرائيل بما يُعزز السلام الإقليمي",
  },
  {
    question: "What percentage of the UAE's population are expatriates?",
    questionAr: "ما النسبة التقريبية للوافدين في عدد سكان الإمارات؟",
    optionsAr: ["حوالي 90%", "حوالي 50%", "حوالي 30%", "حوالي 10%"],
    explanationAr: "الإمارات من أكثر دول العالم تنوعاً سكانياً إذ يُشكّل الوافدون نحو 90% من المقيمين",
  },
  {
    question: "Which UAE city was designated as a UNESCO World Heritage site for its cultural significance?",
    questionAr: "أيٌّ من مدن الإمارات صُنِّف موقعاً لليونسكو للتراث العالمي؟",
    optionsAr: ["العين", "دبي", "الشارقة", "عجمان"],
    explanationAr: "صُنِّفت مواقع العين بما فيها الواحات والمناطق الأثرية تراثاً عالمياً لليونسكو عام 2011",
  },
  {
    question: "What is the 'Mars 2117 Project'?",
    questionAr: "ما 'مشروع المريخ 2117'؟",
    optionsAr: ["خطة لبناء مستوطنة بشرية على المريخ", "مشروع تلسكوب", "برنامج أقمار اصطناعية", "مبادرة تعدين الكويكبات"],
    explanationAr: "مشروع المريخ 2117 هو المشروع الإماراتي طويل الأمد الطموح لإقامة مستوطنة بشرية على المريخ بحلول 2117",
  },
  {
    question: "Which sector contributes the most to Dubai's GDP today?",
    questionAr: "أيٌّ من القطاعات يُسهم الآن بأكبر نسبة في الناتج المحلي لدبي؟",
    optionsAr: ["التجارة والخدمات اللوجستية والسياحة", "النفط والغاز", "الزراعة", "التصنيع فقط"],
    explanationAr: "نجحت دبي في تنويع اقتصادها وباتت التجارة والخدمات اللوجستية والسياحة تتصدر قطاع النفط",
  },
  {
    question: "What is the UAE's position in the Global Gender Gap Report?",
    questionAr: "ما موقع الإمارات في تقرير الفجوة بين الجنسين على المستوى العالمي؟",
    optionsAr: ["الأولى في العالم العربي", "الأخيرة في المنطقة", "غير مشاركة", "دون المتوسط العالمي"],
    explanationAr: "تتصدر الإمارات دول العالم العربي باستمرار في مجال المساواة بين الجنسين وتمكين المرأة",
  },
  {
    question: "Which global event did the UAE host in 2020-2021?",
    questionAr: "أيٌّ من الفعاليات العالمية استضافتها الإمارات في 2020-2021؟",
    optionsAr: ["إكسبو 2020 دبي", "الألعاب الأولمبية", "كأس العالم", "قمة مجموعة العشرين"],
    explanationAr: "استضافت إكسبو 2020 دبي (المنعقد فعلياً 2021-2022 بسبب جائحة كوفيد) عرضاً للإبداع والثقافة العالميين",
  },

  // ═══════════════════════════════════════════════════════════════════
  // SOCIAL STUDIES — GRADE 12
  // ═══════════════════════════════════════════════════════════════════
  {
    question: "What is the 'UAE Centennial 2071' focused on achieving?",
    questionAr: "ما الذي يركز عليه 'مئوية الإمارات 2071'؟",
    optionsAr: ["التميز في التعليم والاقتصاد والحوكمة وجودة الحياة", "الاستقلال الكامل عن النفط فقط", "النمو السكاني إلى 50 مليون", "التوسع العسكري"],
    explanationAr: "يستهدف مئوية الإمارات 2071 تنمية شاملة في التعليم والاقتصاد والحوكمة والسعادة",
  },
  {
    question: "Which factor most contributed to the rapid development of the UAE after 1971?",
    questionAr: "أيٌّ من العوامل أسهم أكثر في التطور السريع للإمارات بعد عام 1971؟",
    optionsAr: ["الاستخدام الاستراتيجي لعائدات النفط في البنية التحتية والتنويع", "المساعدات الأجنبية", "السياحة فقط", "التوسع الزراعي"],
    explanationAr: "أتاح الاستثمار الحكيم لعائدات النفط في البنية التحتية والتعليم والصحة والتنويع الاقتصادي تطوراً سريعاً",
  },
  {
    question: "How does the UAE's federal system balance national and emirate-level governance?",
    questionAr: "كيف يحقق النظام الاتحادي في الإمارات التوازن بين الحوكمة الوطنية والمحلية؟",
    optionsAr: ["الحكومة الاتحادية تتولى السياسة الخارجية والدفاع، والإمارات تدير شؤونها المحلية", "مركزية كاملة", "لا سلطة اتحادية", "كل إمارة مستقلة تماماً"],
    explanationAr: "يُفوّض النظام الاتحادي الإماراتي الدفاع والشؤون الخارجية والهجرة للمستوى الاتحادي، فيما تتولى الإمارات إدارة شؤونها المحلية",
  },
  {
    question: "What role does the UAE play in OPEC?",
    questionAr: "ما الدور الذي تؤديه الإمارات في منظمة أوبك؟",
    optionsAr: ["منتج نفطي رئيسي وعضو مؤثر", "عضو مراقب فقط", "ليست عضواً", "عضو مؤسس فقط دون دور حالي"],
    explanationAr: "الإمارات عضو مؤسس في أوبك وأحد أكبر منتجي النفط مع دور محوري في أسواق الطاقة العالمية",
  },
  {
    question: "What is the UAE's approach to sustainable development?",
    questionAr: "ما نهج الإمارات في التنمية المستدامة؟",
    optionsAr: ["الموازنة بين النمو الاقتصادي وحماية البيئة", "تجاهل الاعتبارات البيئية", "التركيز على الطاقة الشمسية فقط", "التخلي عن التطوير الصناعي"],
    explanationAr: "تسعى الإمارات إلى التنمية المستدامة عبر الاستثمار في الطاقة النظيفة وجهود الحفاظ على البيئة والمبادرات الخضراء",
  },
  {
    question: "How has the UAE positioned itself as a global hub?",
    questionAr: "كيف رسّخت الإمارات مكانتها مركزاً عالمياً؟",
    optionsAr: ["من خلال الموقع الاستراتيجي والبنية التحتية العالمية وسياسات صديقة للأعمال", "بتقييد الاستثمار الأجنبي", "بالعزلة عن التجارة الدولية", "بالتركيز على صادرات النفط فقط"],
    explanationAr: "تستثمر الإمارات موقعها الجغرافي وبنيتها التحتية الحديثة وسياساتها المنفتحة لتكون مركزاً عالمياً للأعمال والسياحة",
  },

  // ═══════════════════════════════════════════════════════════════════
  // COMPUTER SCIENCE — GRADE 9
  // ═══════════════════════════════════════════════════════════════════
  {
    question: "Which of these is NOT a web browser?",
    questionAr: "أيٌّ من التالية ليس متصفح ويب؟",
    optionsAr: ["Microsoft Word", "Google Chrome", "Mozilla Firefox", "Safari"],
    explanationAr: "Microsoft Word برنامج معالجة نصوص وليس متصفح ويب",
  },
  {
    question: "What is the binary number system based on?",
    questionAr: "على ماذا يقوم نظام العد الثنائي؟",
    optionsAr: ["0 و 1", "0 إلى 9", "A إلى Z", "1 إلى 10"],
    explanationAr: "الثنائي نظام أساسه 2 يستخدم رقمين فقط: 0 و 1",
  },
  {
    question: "What is 'phishing' in cybersecurity?",
    questionAr: "ما 'التصيد الاحتيالي' في أمن المعلومات؟",
    optionsAr: ["محاولة سرقة المعلومات الشخصية عبر رسائل أو مواقع مزيفة", "اصطياد فيروسات الحاسوب", "صيد بيانات من قواعد البيانات", "البحث عن الملفات"],
    explanationAr: "التصيد الاحتيالي هجوم إلكتروني ينتحل فيه المهاجمون هوية جهات موثوقة لسرقة معلومات حساسة",
  },
  {
    question: "What is an algorithm?",
    questionAr: "ما الخوارزمية؟",
    optionsAr: ["إجراء خطوة بخطوة لحل مشكلة", "لغة برمجة", "نوع من الحاسوب", "رسالة خطأ"],
    explanationAr: "الخوارزمية سلسلة محددة من التعليمات لحل مشكلة أو تنفيذ مهمة",
  },
  {
    question: "Which storage device has the largest typical capacity?",
    questionAr: "أيٌّ من أجهزة التخزين يتمتع بأكبر سعة تخزين عادةً؟",
    optionsAr: ["القرص الصلب", "محرك USB", "القرص المدمج CD-ROM", "القرص المرن"],
    explanationAr: "تتمتع الأقراص الصلبة عادةً بأكبر سعة تخزين تتراوح بين مئات الجيجابايت وعدة تيرابايت",
  },
  {
    question: "What does 'IF-THEN-ELSE' represent in programming?",
    questionAr: "ماذا يمثل 'IF-THEN-ELSE' في البرمجة؟",
    optionsAr: ["جملة شرطية", "حلقة تكرار", "متغير", "دالة"],
    explanationAr: "IF-THEN-ELSE جملة شرطية تُنفّذ كودًا مختلفاً بحسب ما إذا كان الشرط صحيحاً أم لا",
  },
  {
    question: "What is cloud computing?",
    questionAr: "ما الحوسبة السحابية؟",
    optionsAr: ["تخزين البيانات والوصول إليها عبر الإنترنت", "الحوسبة أثناء الطقس الغائم", "نوع من شاشات الحاسوب", "التخزين المحلي على الجهاز"],
    explanationAr: "الحوسبة السحابية تعني تخزين البيانات والبرامج والوصول إليها عبر الإنترنت بدلاً من الحاسوب المحلي",
  },
  {
    question: "Which practice is MOST important for creating a strong password?",
    questionAr: "أيٌّ من الممارسات أكثر أهمية لإنشاء كلمة مرور قوية؟",
    optionsAr: ["استخدام خليط من الحروف والأرقام والرموز", "استخدام اسمك", "استخدام كلمة المرور ذاتها في كل مكان", "استخدام الأرقام فقط"],
    explanationAr: "تجمع كلمات المرور القوية بين الحروف الكبيرة والصغيرة والأرقام والرموز الخاصة لمقاومة الاختراق",
  },
  {
    question: "What happens when you 'debug' a program?",
    questionAr: "ماذا تفعل حين 'تُصحّح' (debug) برنامجاً؟",
    optionsAr: ["تجد الأخطاء وتصلحها في الكود", "تحذف البرنامج", "تجعله يعمل بشكل أسرع", "تشفّر البيانات"],
    explanationAr: "التصحيح (Debugging) عملية تحديد الأخطاء وتحليلها وإزالتها من البرامج",
  },
  {
    question: "Why is it important to regularly update software and operating systems?",
    questionAr: "لماذا من المهم تحديث البرامج وأنظمة التشغيل بانتظام؟",
    optionsAr: ["لإصلاح الثغرات الأمنية وتحسين الأداء", "لجعل الحاسوب أبطأ", "لحذف جميع الملفات", "لتغيير مظهر الألوان"],
    explanationAr: "تُسدّ التحديثات الثغرات الأمنية وتُصلح الأخطاء وكثيراً ما تُحسّن الأداء وتُضيف ميزات جديدة",
  },

  // ═══════════════════════════════════════════════════════════════════
  // COMPUTER SCIENCE — GRADE 10
  // ═══════════════════════════════════════════════════════════════════
  {
    question: "What is the time complexity of binary search algorithm?",
    questionAr: "ما التعقيد الزمني لخوارزمية البحث الثنائي؟",
    optionsAr: ["O(log n)", "O(n)", "O(n²)", "O(1)"],
    explanationAr: "البحث الثنائي تعقيده زمني لوغاريتمي O(log n) لأنه يُقسّم فضاء البحث إلى النصف في كل خطوة",
  },
  {
    question: "In object-oriented programming, what is encapsulation?",
    questionAr: "في البرمجة الكائنية، ما التغليف (encapsulation)؟",
    optionsAr: ["تجميع البيانات والدوال المتعاملة معها في وحدة واحدة", "وراثة خصائص من الصنف الأب", "استخدام أشكال متعددة لدالة", "إنشاء كائنات من الأصناف"],
    explanationAr: "التغليف مفهوم يجمع البيانات والدوال ويُقيّد الوصول إلى التفاصيل الداخلية",
  },
  {
    question: "What does AI stand for, and what is its primary goal in UAE Vision 2071?",
    questionAr: "ماذا يعني AI، وما هدفه الأساسي في رؤية الإمارات 2071؟",
    optionsAr: ["الذكاء الاصطناعي - تحقيق اعتماد 100% على الحكومة الذكية بحلول 2031", "التكامل الآلي - أتمتة جميع الصناعات", "الابتكار المتقدم - الريادة في الابتكار", "التكامل الاصطناعي - ربط جميع الأنظمة"],
    explanationAr: "تهدف الإمارات إلى تحقيق 100% من خدمات الحكومة بالذكاء الاصطناعي بحلول 2031 ضمن رؤية 2071",
  },
  {
    question: "What is the difference between a stack and a queue data structure?",
    questionAr: "ما الفرق بين هياكل بيانات المكدس والطابور؟",
    optionsAr: ["المكدس LIFO، الطابور FIFO", "المكدس FIFO، الطابور LIFO", "كلاهما LIFO", "كلاهما FIFO"],
    explanationAr: "المكدس يتبع مبدأ آخر داخل أول خارج (LIFO)، والطابور يتبع أول داخل أول خارج (FIFO)",
  },
  {
    question: "In databases, what does SQL stand for?",
    questionAr: "في قواعد البيانات، ماذا تعني SQL؟",
    optionsAr: ["لغة الاستعلام البنيوية", "لغة الأسئلة البسيطة", "المنطق القياسي للاستعلامات", "لغة استعلامات النظام"],
    explanationAr: "SQL هي لغة الاستعلام البنيوية المستخدمة لإدارة قواعد البيانات والاستعلام عنها",
  },
  {
    question: "What is machine learning?",
    questionAr: "ما التعلم الآلي؟",
    optionsAr: ["تعلّم الحواسيب من البيانات دون برمجة صريحة", "آلات تتعلم المشي", "برمجة الروبوتات", "تعليم الحواسيب رياضيات أساسية"],
    explanationAr: "التعلم الآلي فرع من الذكاء الاصطناعي تتعلم فيه الأنظمة من البيانات وتتحسن دون برمجة صريحة",
  },
  {
    question: "What is the main advantage of using functions in programming?",
    questionAr: "ما الميزة الأساسية لاستخدام الدوال في البرمجة؟",
    optionsAr: ["إمكانية إعادة استخدام الكود والتجزئة", "تنفيذ أبطأ", "استخدام ذاكرة أكبر", "صعوبة التصحيح"],
    explanationAr: "تتيح الدوال إعادة استخدام الكود وتجعل البرامج وحدوية وأسهل في الصيانة وأقل تكراراً",
  },

  // ═══════════════════════════════════════════════════════════════════
  // COMPUTER SCIENCE — GRADE 11
  // ═══════════════════════════════════════════════════════════════════
  {
    question: "In networking, what does 'IP' stand for?",
    questionAr: "في الشبكات، ماذا تعني 'IP'؟",
    optionsAr: ["بروتوكول الإنترنت", "البرنامج الداخلي", "معالجة المعلومات", "مزود الإنترنت"],
    explanationAr: "IP هو بروتوكول الإنترنت، وهو مجموعة القواعد التي تحكم إرسال البيانات عبر الشبكات",
  },
  {
    question: "What is the purpose of version control systems like Git?",
    questionAr: "ما الغرض من أنظمة التحكم في الإصدارات كـ Git؟",
    optionsAr: ["تتبع تغييرات الكود وتمكين التعاون", "تجميع البرامج", "اختبار البرمجيات", "تصميم واجهات المستخدم"],
    explanationAr: "أنظمة التحكم في الإصدارات تتبع تغييرات الكود وتُمكّن التعاون والعودة إلى الإصدارات السابقة",
  },
  {
    question: "What is polymorphism in object-oriented programming?",
    questionAr: "ما تعدد الأشكال في البرمجة الكائنية؟",
    optionsAr: ["قدرة كائنات مختلفة على الاستجابة للأسلوب ذاته بطرق مختلفة", "إنشاء كائنات متعددة", "استخدام متغيرات كثيرة", "وجود ملفات متعددة"],
    explanationAr: "تعدد الأشكال يتيح التعامل مع كائنات من أنواع مختلفة بشكل موحد مع استجابة كل منها بطريقة مختلفة",
  },
  {
    question: "Which sorting algorithm has the best average-case time complexity?",
    questionAr: "أيٌّ من خوارزميات الترتيب يمتلك أفضل تعقيد زمني في المتوسط؟",
    optionsAr: ["Merge Sort O(n log n)", "Bubble Sort O(n²)", "Selection Sort O(n²)", "Insertion Sort O(n²)"],
    explanationAr: "Merge Sort تعقيده O(n log n) في جميع الحالات مما يجعله أكفأ من الخوارزميات التربيعية للبيانات الكبيرة",
  },
  {
    question: "What is blockchain technology primarily used for?",
    questionAr: "ما الاستخدام الأساسي لتقنية سلسلة الكتل (بلوكتشين)؟",
    optionsAr: ["إنشاء دفاتر حسابات رقمية آمنة ولامركزية", "حجب المواقع", "تخزين كلمات المرور", "تشفير البريد الإلكتروني"],
    explanationAr: "البلوكتشين تقنية دفتر موزع تُنشئ سجلات آمنة وشفافة ومقاومة للتلاعب",
  },
  {
    question: "What is the purpose of an API (Application Programming Interface)?",
    questionAr: "ما الغرض من واجهة برمجة التطبيقات (API)؟",
    optionsAr: ["السماح لتطبيقات برمجية مختلفة بالتواصل", "إنشاء واجهات المستخدم", "تصحيح البرامج", "تخزين البيانات"],
    explanationAr: "تُحدّد واجهات API كيفية تفاعل مكونات البرامج مما يُمكّن التطبيقات المختلفة من التواصل وتبادل البيانات",
  },
  {
    question: "In cybersecurity, what is 'encryption'?",
    questionAr: "في أمن المعلومات، ما 'التشفير'؟",
    optionsAr: ["تحويل البيانات إلى صيغة مشفرة لمنع الوصول غير المصرح به", "حذف البيانات", "نسخ البيانات", "ضغط البيانات"],
    explanationAr: "التشفير يُحوّل النص العادي إلى نص مشفر باستخدام خوارزميات لحماية البيانات من الوصول غير المصرح به",
  },

  // ═══════════════════════════════════════════════════════════════════
  // COMPUTER SCIENCE — GRADE 12
  // ═══════════════════════════════════════════════════════════════════
  {
    question: "What is the Internet of Things (IoT)?",
    questionAr: "ما إنترنت الأشياء (IoT)؟",
    optionsAr: ["شبكة من الأجهزة المادية المترابطة التي تتبادل البيانات", "مجموعة من المواقع الإلكترونية", "منصات التواصل الاجتماعي", "أنظمة التخزين السحابي"],
    explanationAr: "إنترنت الأشياء شبكة مترابطة من الأجهزة المادية التي تجمع البيانات وتتبادلها عبر الإنترنت",
  },
  {
    question: "What is Big Data?",
    questionAr: "ما البيانات الضخمة (Big Data)؟",
    optionsAr: ["مجموعات بيانات ضخمة جداً تتطلب أدوات متخصصة للمعالجة", "بيانات مخزنة على أقراص صلبة كبيرة", "ملفات نصية طويلة", "صور عالية الدقة"],
    explanationAr: "البيانات الضخمة مجموعات بيانات كبيرة ومعقدة يعجز عن معالجتها الفعّالة أدوات معالجة البيانات التقليدية",
  },
  {
    question: "Which data structure is best suited for implementing a browser's back button?",
    questionAr: "أيٌّ من هياكل البيانات الأنسب لتطبيق زر 'رجوع' في المتصفح؟",
    optionsAr: ["المكدس", "الطابور", "المصفوفة", "الشجرة"],
    explanationAr: "خاصية LIFO في المكدس تجعله مثالياً لتتبع تاريخ التصفح لزر الرجوع",
  },
  {
    question: "What is the difference between compilers and interpreters?",
    questionAr: "ما الفرق بين المُجمِّعات والمُفسِّرات؟",
    optionsAr: ["المُجمِّع يترجم الكود كاملاً دفعة واحدة؛ المُفسِّر يُنفّذه سطراً سطراً", "المُجمِّع أسرع في التنفيذ", "المُفسِّر يُنتج ملفات قابلة للتنفيذ", "لا فرق بينهما"],
    explanationAr: "المُجمِّع يترجم الكود المصدري كاملاً إلى كود آلي قبل التنفيذ؛ المُفسِّر يُنفّذ الكود سطراً سطراً في الوقت الفعلي",
  },
  {
    question: "What is a neural network in AI?",
    questionAr: "ما الشبكة العصبية في الذكاء الاصطناعي؟",
    optionsAr: ["نظام حوسبي مستوحى من بنية الدماغ البشري", "شبكة من الحواسيب", "شبكة تواصل اجتماعي", "نوع من قواعد البيانات"],
    explanationAr: "الشبكات العصبية نماذج ذكاء اصطناعي تتكون من طبقات عُقَد مترابطة تعالج المعلومات بأسلوب مشابه لخلايا الدماغ",
  },
  {
    question: "What is the primary purpose of ethical hacking?",
    questionAr: "ما الغرض الأساسي من القرصنة الأخلاقية؟",
    optionsAr: ["تحديد الثغرات الأمنية قبل أن يجدها القراصنة الخبثاء", "سرقة البيانات بشكل قانوني", "اختراق الأنظمة للمتعة", "إنشاء فيروسات"],
    explanationAr: "يُخوَّل القراصنة الأخلاقيون باختبار الأنظمة بحثاً عن الثغرات لمساعدة المؤسسات على تحسين أمنها",
  },
];

export async function applyGrades9to12ArabicContent(): Promise<void> {
  console.log('Applying Arabic content for Grades 9–12 quiz questions...');
  let updated = 0;
  let notFound = 0;

  for (const item of GRADES9_12_ARABIC_CONTENT) {
    const results = await db
      .select({ id: quizQuestions.id })
      .from(quizQuestions)
      .where(eq(quizQuestions.question, item.question))
      .limit(1);

    if (results.length === 0) {
      console.warn(`  ⚠ Not found: "${item.question.substring(0, 60)}..."`);
      notFound++;
      continue;
    }

    await db
      .update(quizQuestions)
      .set({
        questionAr: item.questionAr,
        optionsAr: item.optionsAr,
        explanationAr: item.explanationAr,
      })
      .where(eq(quizQuestions.id, results[0].id));
    updated++;
  }

  console.log(`Grades 9–12 Arabic content: ${updated} updated, ${notFound} not found`);
}
