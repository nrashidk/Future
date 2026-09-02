/**
 * Migration: Populate Arabic titles, descriptions, and required skills for all 68 careers
 * Uses career English title as the match key
 */

import { db } from '../db';
import { careers } from '../../shared/schema';
import { eq } from 'drizzle-orm';

interface CareerArContent {
  title: string;
  titleAr: string;
  descriptionAr: string;
  requiredSkillsAr: string[];
  educationLevelAr: string;
}

const CAREER_ARABIC_CONTENT: CareerArContent[] = [
  // NOTE: Add entries here only for the canonical 68 careers that ship with the
  // product seed. Rogue / test DB entries with non-standard titles are excluded
  // intentionally and should be cleaned up via the admin dashboard.
  // --- PHASE 3 STEP 1: Space & Future Sciences ------------------------------
  // ⚠️ descriptionAr on BOTH entries is the ENGLISH text, as an explicit,
  // greppable placeholder. titleAr / requiredSkillsAr / educationLevelAr are
  // real translations (terminology, low risk); the two-sentence student-facing
  // descriptions are held for the batch translation pass so they match the
  // register of the existing 37 rather than reading as machine output.
  // grep TODO(i18n) before shipping Arabic reports for these careers.
  {
    title: "Aerospace Engineer",
    titleAr: "مهندس طيران وفضاء",
    // TODO(i18n): needs professional translation - currently English fallback.
    descriptionAr: "Design the satellites, rockets and aircraft that leave the ground and stay there. Work on the propulsion, structures and control systems that make a Mars mission or an Earth-observation satellite actually fly.",
    requiredSkillsAr: ["الديناميكا الهوائية", "أنظمة الدفع", "هندسة الأنظمة", "المحاكاة والاختبار"],
    educationLevelAr: "بكالوريوس هندسة طيران وفضاء أو هندسة ميكانيكية",
  },
  {
    title: "Space Scientist (Astrophysicist)",
    titleAr: "عالم فضاء (فيزياء فلكية)",
    // TODO(i18n): needs professional translation - currently English fallback.
    descriptionAr: "Study planets, stars and the physics of everything beyond Earth. Analyse data from telescopes and space probes to answer questions nobody has answered yet, and help plan the missions that go looking.",
    requiredSkillsAr: ["الفيزياء الفلكية", "تحليل البيانات", "النمذجة العلمية", "الكتابة البحثية"],
    educationLevelAr: "ماجستير أو دكتوراه في الفيزياء أو علم الفلك أو علوم الفضاء",
  },
  {
    title: "Software Engineer",
    titleAr: "مهندس برمجيات",
    descriptionAr: "بنِ التطبيقات والمواقع والألعاب التي يستخدمها الناس يومياً. حوّل الأفكار إلى برامج حقيقية من خلال كتابة الكود وحل التحديات التقنية.",
    requiredSkillsAr: ["البرمجة", "حل المشكلات", "هياكل البيانات", "الخوارزميات"],
    educationLevelAr: "بكالوريوس علوم الحاسب أو مجال ذي صلة",
  },
  {
    title: "Data Scientist",
    titleAr: "عالم بيانات",
    descriptionAr: "اكتشف الأنماط الخفية في كميات هائلة من البيانات لمساعدة الشركات في التنبؤ بالاتجاهات وفهم عملائها واتخاذ قرارات أذكى. استخدم الذكاء الاصطناعي والتعلم الآلي لحل مشاكل العالم الحقيقي.",
    requiredSkillsAr: ["الإحصاء", "التعلم الآلي", "بايثون/R", "تصوير البيانات"],
    educationLevelAr: "بكالوريوس أو ماجستير في علم البيانات أو الإحصاء أو علوم الحاسب",
  },
  {
    title: "Renewable Energy Engineer",
    titleAr: "مهندس طاقة متجددة",
    descriptionAr: "صمّم الألواح الشمسية وتوربينات الرياح وأنظمة الطاقة النظيفة التي تُزوّد المنازل والمدن بالكهرباء دون الإضرار بالكوكب. ساعد في خلق مستقبل مستدام للأجيال القادمة.",
    requiredSkillsAr: ["التصميم الهندسي", "الاستدامة", "إدارة المشاريع", "التحليل التقني"],
    educationLevelAr: "بكالوريوس هندسة (كهربائية أو ميكانيكية أو بيئية)",
  },
  {
    title: "Healthcare Professional (Nurse)",
    titleAr: "مهني رعاية صحية (ممرض/ممرضة)",
    descriptionAr: "اعتنِ بالمرضى في أحلك لحظاتهم، من مساعدة المواليد في أولى أنفاسهم إلى دعم الأسر في الأوقات الصعبة. أحدث فارقاً حقيقياً في حياة الناس كل يوم.",
    requiredSkillsAr: ["رعاية المرضى", "المعرفة الطبية", "التواصل", "التعاطف"],
    educationLevelAr: "بكالوريوس علوم التمريض (BSN)",
  },
  {
    title: "Digital Marketing Specialist",
    titleAr: "أخصائي تسويق رقمي",
    descriptionAr: "أنشئ حملات جذابة وأنمِّ مجتمعات التواصل الاجتماعي وساعد العلامات التجارية على التواصل مع عملائها عبر الإنترنت. حوّل الأفكار الإبداعية إلى محتوى وإعلانات يريد الناس متابعتها.",
    requiredSkillsAr: ["وسائل التواصل الاجتماعي", "إنشاء المحتوى", "التحليلات", "تحسين محركات البحث"],
    educationLevelAr: "بكالوريوس تسويق أو اتصالات أو إدارة أعمال",
  },
  {
    title: "Graphic Designer",
    titleAr: "مصمم جرافيك",
    descriptionAr: "صمّم شعارات وملصقات ومواقع وعبوات تشد الأنظار وتحكي القصص. أحيِ العلامات التجارية من خلال الألوان والأشكال والإبداع البصري الذي يبقى في الأذهان.",
    requiredSkillsAr: ["التصميم الإبداعي", "حزمة أدوبي الإبداعية", "الطباعة الفنية", "التواصل البصري"],
    educationLevelAr: "بكالوريوس تصميم جرافيك أو فنون جميلة",
  },
  {
    title: "Mechanical Engineer",
    titleAr: "مهندس ميكانيكي",
    descriptionAr: "اخترع وطوّر الآلات التي تُيسّر الحياة، من الروبوتات والطائرات المسيّرة إلى السيارات والأجهزة الطبية. اختبر تصاميمك وحل المشكلات التقنية وشاهد إبداعاتك تتجسد.",
    requiredSkillsAr: ["برامج التصميم بالحاسوب", "الفيزياء", "علم المواد", "حل المشكلات"],
    educationLevelAr: "بكالوريوس هندسة ميكانيكية",
  },
  {
    title: "Financial Analyst",
    titleAr: "محلل مالي",
    descriptionAr: "ساعد الشركات والمستثمرين على تنمية أموالهم من خلال تحليل الأسواق والتنبؤ بالاتجاهات وإيجاد فرص الاستثمار الذكية. حوّل الأرقام إلى رؤى تقود قرارات بملايين الدولارات.",
    requiredSkillsAr: ["النمذجة المالية", "إكسل", "تحليل البيانات", "تقييم المخاطر"],
    educationLevelAr: "بكالوريوس مالية أو اقتصاد أو محاسبة",
  },
  {
    title: "Teacher (Secondary Education)",
    titleAr: "معلم (التعليم الثانوي)",
    descriptionAr: "شكّل العقول الشابة وألهم الجيل القادم من العلماء والفنانين والقادة. اجعل المواضيع المعقدة مثيرة للاهتمام وساعد الطلاب على اكتشاف مواهبهم ومشاهدتهم وهم يتحولون إلى متعلمين واثقين.",
    requiredSkillsAr: ["الخبرة في المادة", "التواصل", "الصبر", "تطوير المناهج"],
    educationLevelAr: "بكالوريوس تربية أو تخصص في المادة + شهادة تدريس",
  },
  {
    title: "Environmental Scientist",
    titleAr: "عالم بيئي",
    descriptionAr: "احمِ كوكبنا من خلال دراسة التلوث وتغير المناخ والنظم البيئية. طوّر حلولاً للتحديات البيئية وساعد المجتمعات على العيش في انسجام مع الطبيعة.",
    requiredSkillsAr: ["البحث", "تحليل البيانات", "السياسة البيئية", "العمل الميداني"],
    educationLevelAr: "بكالوريوس علوم بيئية أو مجال ذي صلة",
  },
  {
    title: "Civil Engineer",
    titleAr: "مهندس مدني",
    descriptionAr: "خطّط وشيّد الطرق والجسور والمطارات وأنظمة المياه التي تعتمد عليها المجتمعات يومياً. حوّل المخططات إلى هياكل حقيقية تدوم لأجيال.",
    requiredSkillsAr: ["التصميم الإنشائي", "إدارة المشاريع", "أوتوكاد", "الرياضيات"],
    educationLevelAr: "بكالوريوس هندسة مدنية",
  },
  {
    title: "Architect",
    titleAr: "مهندس معماري",
    descriptionAr: "صمّم مبانٍ وفضاءات رائعة يعيش ويعمل ويتجمع فيها الناس. امزج الفن بالهندسة لإنشاء منشآت جميلة ووظيفية في آن واحد.",
    requiredSkillsAr: ["التصميم المعماري", "النمذجة ثلاثية الأبعاد", "قوانين البناء", "الإبداع"],
    educationLevelAr: "بكالوريوس عمارة + ترخيص مهني",
  },
  {
    title: "Electrical Engineer",
    titleAr: "مهندس كهربائي",
    descriptionAr: "صمّم الأنظمة الكهربائية التي تُشغّل كل شيء من الهواتف الذكية إلى شبكات الطاقة. اعمل على تقنيات متطورة كالسيارات الكهربائية والطاقة المتجددة والأجهزة الذكية.",
    requiredSkillsAr: ["تصميم الدوائر الكهربائية", "أنظمة الطاقة", "الإلكترونيات", "البرمجة"],
    educationLevelAr: "بكالوريوس هندسة كهربائية",
  },
  {
    title: "Biomedical Engineer",
    titleAr: "مهندس طبي حيوي",
    descriptionAr: "ابتكر أجهزة طبية منقذة للحياة كالأعضاء الاصطناعية والأطراف التعويضية ومعدات التشخيص. ادمج الهندسة مع الأحياء لحل تحديات الرعاية الصحية وتحسين حياة المرضى.",
    requiredSkillsAr: ["تصميم الأجهزة الطبية", "الميكانيكا الحيوية", "الامتثال التنظيمي", "البحث"],
    educationLevelAr: "بكالوريوس هندسة طبية حيوية",
  },
  {
    title: "Pharmacist",
    titleAr: "صيدلاني",
    descriptionAr: "كن الخبير في الأدوية الذي يساعد المرضى على فهم وصفاتهم والحفاظ على صحتهم. أرشد الأطباء بشأن التفاعلات الدوائية وتأكد من حصول الناس على العلاجات الصحيحة بأمان.",
    requiredSkillsAr: ["علم الأدوية", "إرشاد المرضى", "التفاعلات الدوائية", "الاهتمام بالتفاصيل"],
    educationLevelAr: "دكتوراه في الصيدلة (PharmD) + ترخيص مهني",
  },
  {
    title: "Doctor (General Practitioner)",
    titleAr: "طبيب (طب عام)",
    descriptionAr: "كن أول من يلجأ إليه الناس عند المرض أو الحاجة إلى مشورة طبية. شخّص الأمراض وعالج المرضى وابنِ علاقات ثقة تحافظ على صحة المجتمعات.",
    requiredSkillsAr: ["التشخيص الطبي", "رعاية المرضى", "المهارات السريرية", "التواصل"],
    educationLevelAr: "شهادة طب (MD أو DO) + إقامة طبية + ترخيص",
  },
  {
    title: "Dentist",
    titleAr: "طبيب أسنان",
    descriptionAr: "ساعد الناس في الحفاظ على ابتساماتهم الصحية وأسنانهم الواثقة. عالج التسوس وأجرِ التنظيف وثقّف المرضى على صحة الفم بدقة واهتمام.",
    requiredSkillsAr: ["إجراءات طب الأسنان", "رعاية المرضى", "التنسيق الحركي", "الاهتمام بالتفاصيل"],
    educationLevelAr: "دكتوراه جراحة الأسنان (DDS) أو طب الأسنان (DMD) + ترخيص",
  },
  {
    title: "Physical Therapist",
    titleAr: "معالج فيزيائي",
    descriptionAr: "ساعد الرياضيين على التعافي من الإصابات وأعِن المرضى المسنين على استعادة حركتهم وارشد الناس في تمارين إعادة التأهيل. أعِد الحركة لمن يعانون من الألم.",
    requiredSkillsAr: ["إعادة تأهيل المرضى", "معرفة التشريح", "العلاج بالتمارين", "التعاطف"],
    educationLevelAr: "دكتوراه في العلاج الطبيعي (DPT) + ترخيص",
  },
  {
    title: "Psychologist",
    titleAr: "طبيب نفسي (أخصائي علم نفس)",
    descriptionAr: "ساعد الناس على تجاوز القلق والاكتئاب وتحديات الحياة من خلال الإرشاد والعلاج. افهم كيف يعمل العقل البشري وارشد الناس نحو صحة نفسية أفضل.",
    requiredSkillsAr: ["الإرشاد", "البحث", "التقييم", "التعاطف"],
    educationLevelAr: "دكتوراه في علم النفس (PhD أو PsyD) + ترخيص",
  },
  {
    title: "Social Worker",
    titleAr: "أخصائي اجتماعي",
    descriptionAr: "دافع عن الأشخاص الأكثر احتياجاً. ربط الأسر بالموارد المتاحة ودعم الأطفال في المواقف الصعبة وانتصر للمجتمعات الهشة.",
    requiredSkillsAr: ["إدارة الحالات", "المناصرة", "التواصل", "التعاطف"],
    educationLevelAr: "بكالوريوس خدمة اجتماعية (BSW) أو ماجستير (MSW)",
  },
  {
    title: "Lawyer",
    titleAr: "محامٍ",
    descriptionAr: "ناضل من أجل العدالة في قاعات المحاكم وتفاوض على صفقات تجارية كبرى ودافع عن حقوق الناس. استخدم الحجج المقنعة والمعرفة القانونية لحل النزاعات المعقدة.",
    requiredSkillsAr: ["البحث القانوني", "المناصرة", "الكتابة", "التفكير النقدي"],
    educationLevelAr: "درجة القانون (JD) + اختبار المحاماة",
  },
  {
    title: "Accountant",
    titleAr: "محاسب",
    descriptionAr: "أدر الشؤون المالية للشركات وأعدّ الإقرارات الضريبية وساعد المؤسسات في اتخاذ قرارات مالية سليمة. تعامل مع الأرقام لضمان ربحية المنظمات وامتثالها للقانون.",
    requiredSkillsAr: ["المحاسبة", "إعداد الضرائب", "إكسل", "الاهتمام بالتفاصيل"],
    educationLevelAr: "بكالوريوس محاسبة + شهادة محاسب قانوني معتمد (CPA)",
  },
  {
    title: "Human Resources Manager",
    titleAr: "مدير موارد بشرية",
    descriptionAr: "ابنِ ثقافات مؤسسية رائعة من خلال توظيف الكفاءات وحل النزاعات في بيئة العمل وتطوير برامج تجعل الموظفين سعداء ومنتجين. كن الجسر بين الإدارة والموظفين.",
    requiredSkillsAr: ["التوظيف", "علاقات الموظفين", "حل النزاعات", "القيادة"],
    educationLevelAr: "بكالوريوس موارد بشرية أو إدارة أعمال",
  },
  {
    title: "Management Consultant",
    titleAr: "مستشار إداري",
    descriptionAr: "حل التحديات التجارية الصعبة للشركات الكبرى. حلّل المشكلات وقدّم الحلول للمديرين التنفيذيين وساعد المؤسسات على تحويل عملياتها واستراتيجياتها.",
    requiredSkillsAr: ["تحليل الأعمال", "الاستراتيجية", "العروض التقديمية", "حل المشكلات"],
    educationLevelAr: "بكالوريوس إدارة أعمال أو مجال ذي صلة (يُفضّل الماجستير)",
  },
  {
    title: "Entrepreneur",
    titleAr: "رائد أعمال",
    descriptionAr: "حوّل أفكارك إلى واقع من خلال إطلاق مشروعك الخاص. خذ مخاطر محسوبة وابتكر حلولاً للمشاكل وابنِ شيئاً من الصفر تؤمن به.",
    requiredSkillsAr: ["التخطيط التجاري", "المخاطرة المحسوبة", "الابتكار", "القيادة"],
    educationLevelAr: "متنوع (تعليم الأعمال مفيد لكنه غير مطلوب)",
  },
  {
    title: "Sales Manager",
    titleAr: "مدير مبيعات",
    descriptionAr: "قُد فرقاً تُدرّ الإيرادات وتُنمّي الأعمال. طوّر استراتيجيات مبيعات رابحة وحفّز فريقك لتحقيق الأهداف وابنِ علاقات قوية مع العملاء تدوم.",
    requiredSkillsAr: ["استراتيجية المبيعات", "القيادة", "التواصل", "التفاوض"],
    educationLevelAr: "بكالوريوس إدارة أعمال أو تسويق",
  },
  {
    title: "Marketing Manager",
    titleAr: "مدير تسويق",
    descriptionAr: "أنشئ حملات تجعل المنتجات ناجحة والعلامات التجارية لا تُنسى. خطّط لاستراتيجيات الإطلاق وحلّل سلوك العملاء وقُد الفرق الإبداعية للتواصل مع الجمهور المستهدف.",
    requiredSkillsAr: ["استراتيجية التسويق", "التسويق الرقمي", "التحليلات", "الإبداع"],
    educationLevelAr: "بكالوريوس تسويق أو إدارة أعمال",
  },
  {
    title: "Product Manager",
    titleAr: "مدير منتج",
    descriptionAr: "امتلك رؤية المنتجات والميزات الرقمية. تعاون مع المصممين والمهندسين لتحقيق أفكار جديدة واستمع إلى آراء العملاء وقرّر ما سيُبنى في المرحلة القادمة.",
    requiredSkillsAr: ["استراتيجية المنتج", "بحث المستخدمين", "إدارة المشاريع", "التواصل"],
    educationLevelAr: "بكالوريوس إدارة أعمال أو علوم الحاسب أو مجال ذي صلة",
  },
  {
    title: "UX/UI Designer",
    titleAr: "مصمم تجربة المستخدم وواجهاته",
    descriptionAr: "اجعل التطبيقات والمواقع جميلة وسهلة الاستخدام. ابحث في كيفية تفاعل الناس مع التكنولوجيا وصمّم واجهات بديهية وأنشئ تجارب تُسعد المستخدمين.",
    requiredSkillsAr: ["بحث المستخدمين", "تصميم الواجهات", "النمذجة الأولية", "أدوات التصميم"],
    educationLevelAr: "بكالوريوس تصميم أو تفاعل الإنسان بالحاسوب أو مجال ذي صلة",
  },
  {
    title: "Video Game Designer",
    titleAr: "مصمم ألعاب فيديو",
    descriptionAr: "صمّم ألعاباً يحبها اللاعبون. أنشئ عوالم غامرة وطوّر ميكانيكيات اللعب التي تشدّ اللاعبين واحكِ قصصاً مقنعة من خلال تجارب تفاعلية.",
    requiredSkillsAr: ["تصميم الألعاب", "الإبداع", "البرمجة", "سرد القصص"],
    educationLevelAr: "بكالوريوس تصميم ألعاب أو علوم الحاسب",
  },
  {
    title: "Journalist",
    titleAr: "صحفي",
    descriptionAr: "اكشف الحقيقة واروِ القصص المهمة التي تُنير الرأي العام. حقّق في القضايا ذات الأثر وقابل الشخصيات الرئيسية وانقل الأخبار التي تحاسب أصحاب السلطة.",
    requiredSkillsAr: ["الكتابة", "البحث", "إجراء المقابلات", "التفكير النقدي"],
    educationLevelAr: "بكالوريوس صحافة أو اتصالات",
  },
  {
    title: "Content Creator",
    titleAr: "صانع محتوى",
    descriptionAr: "ابنِ متابعين عبر الإنترنت من خلال إنشاء مقاطع وتدوينات ومحتوى يحب الناس مشاهدته ومشاركته. حوّل إبداعك وشخصيتك إلى مهنة على منصات مثل يوتيوب وتيك توك وإنستغرام.",
    requiredSkillsAr: ["إنتاج الفيديو", "وسائل التواصل الاجتماعي", "الإبداع", "إشراك الجمهور"],
    educationLevelAr: "متنوع (درجة في الاتصالات أو الإعلام مفيدة)",
  },
  {
    title: "Photographer",
    titleAr: "مصور فوتوغرافي",
    descriptionAr: "احكِ القصص من خلال صور مؤثرة. التقط حفلات الأعراس وجلسات الأزياء والأحداث الإخبارية أو مشاهد الطبيعة. حوّل اللحظات إلى ذكريات وفن يخلّده الناس.",
    requiredSkillsAr: ["التصوير الفوتوغرافي", "تعديل الصور", "الإضاءة", "الإبداع"],
    educationLevelAr: "التدريب الرسمي مفيد لكنه غير مطلوب دائماً",
  },
  {
    title: "Chef",
    titleAr: "طاهٍ (شيف)",
    descriptionAr: "ابتكر أطباقاً شهية تجعل يوم الناس أجمل. صمّم قوائم الطعام وجرّب النكهات والتقنيات وقُد فرق المطبخ في المطاعم والفنادق أو في مؤسستك الخاصة.",
    requiredSkillsAr: ["الطبخ", "تخطيط قائمة الطعام", "سلامة الغذاء", "الإبداع"],
    educationLevelAr: "مدرسة طهي أو تدريب مهني",
  },
  {
    title: "Fashion Designer",
    titleAr: "مصمم أزياء",
    descriptionAr: "أنشئ الملابس والإكسسوارات التي تحدد الأسلوب والثقافة. ارسم تصاميم أصيلة واختر الأقمشة وشاهد إبداعاتك على منصات العروض أو في المحلات التجارية حول العالم.",
    requiredSkillsAr: ["تصميم الأزياء", "الخياطة", "توقع الاتجاهات", "الإبداع"],
    educationLevelAr: "بكالوريوس تصميم أزياء",
  },
  {
    title: "Interior Designer",
    titleAr: "مصمم داخلي",
    descriptionAr: "حوّل الفضاءات الفارغة إلى غرف جميلة ووظيفية يحب الناس العيش والعمل فيها. اختر الألوان والأثاث والتصاميم التي تتوافق مع أحلام العملاء وأسلوب حياتهم.",
    requiredSkillsAr: ["تخطيط المساحات", "نظرية الألوان", "النمذجة ثلاثية الأبعاد", "التواصل مع العملاء"],
    educationLevelAr: "بكالوريوس تصميم داخلي",
  },
  {
    title: "Web Developer",
    titleAr: "مطور ويب",
    descriptionAr: "أنشئ مواقع وتطبيقات ويب جذابة وعالية الأداء. حوّل تصاميم الواجهات إلى تجارب تفاعلية سلسة باستخدام أحدث تقنيات تطوير الويب، وتعاون مع فرق التصميم لإطلاق مشاريع رقمية مميزة.",
    requiredSkillsAr: ["HTML/CSS", "JavaScript", "أطر العمل الأمامية", "واجهات برمجة التطبيقات"],
    educationLevelAr: "بكالوريوس علوم الحاسب أو مجال ذي صلة",
  },
  // --- PHASE 3 STAGE 1: the 29 derived careers ------------------------------
  // (docs/career-sourcing-map.md §5 Tier 1 + Tier 2, docs/phase3-stage1-done.md)
  //
  // ⚠️ descriptionAr on ALL 29 entries is the ENGLISH text, as an explicit,
  // greppable placeholder — the same convention the two Space careers above use.
  // titleAr / requiredSkillsAr / educationLevelAr are real translations
  // (terminology, low risk); the two-sentence student-facing descriptions are
  // held for the batch translation pass so they match the register of the
  // existing 39 rather than reading as machine output.
  // grep TODO(i18n) before shipping Arabic reports for these careers.

  {
    title: "Cybersecurity Analyst",
    titleAr: "محلل أمن سيبراني",
    // TODO(i18n): needs professional translation - currently English fallback.
    descriptionAr: "Defend banks, hospitals and government systems from hackers by hunting for weaknesses before attackers find them. Investigate real intrusions and build the defences that keep millions of people's data safe.",
    requiredSkillsAr: ["أمن الشبكات", "تحليل التهديدات", "الاستجابة للحوادث", "تقييم المخاطر"],
    educationLevelAr: "بكالوريوس في الأمن السيبراني أو علوم الحاسب أو تقنية المعلومات",
  },
  {
    title: "AI Research Scientist",
    titleAr: "عالم أبحاث الذكاء الاصطناعي",
    // TODO(i18n): needs professional translation - currently English fallback.
    descriptionAr: "Invent the algorithms that let machines see, read and reason. Design and test new AI models, then publish what works so the whole field can build on it.",
    requiredSkillsAr: ["التعلم الآلي", "تصميم الخوارزميات", "النمذجة الرياضية", "مناهج البحث"],
    educationLevelAr: "ماجستير أو دكتوراه في علوم الحاسب أو الذكاء الاصطناعي أو الرياضيات",
  },
  {
    title: "Robotics Engineer",
    titleAr: "مهندس روبوتات",
    // TODO(i18n): needs professional translation - currently English fallback.
    descriptionAr: "Build robots that weld car bodies, pick crops or perform surgery, and write the control code that makes them move precisely. Turn machines into something that can sense the world and act on it.",
    requiredSkillsAr: ["أنظمة التحكم", "التصميم الميكانيكي", "برمجة الأنظمة المدمجة", "تكامل المستشعرات"],
    educationLevelAr: "بكالوريوس في الروبوتات أو الميكاترونكس أو الهندسة الميكانيكية",
  },
  {
    title: "Nuclear Engineer",
    titleAr: "مهندس نووي",
    // TODO(i18n): needs professional translation - currently English fallback.
    descriptionAr: "Design reactor systems that generate huge amounts of electricity without burning anything. Work on the safety, fuel and shielding decisions that let a nuclear plant run for sixty years without harming anyone.",
    requiredSkillsAr: ["فيزياء المفاعلات", "السلامة الإشعاعية", "التحليل الحراري", "هندسة الأنظمة"],
    educationLevelAr: "بكالوريوس في الهندسة النووية أو الهندسة الميكانيكية",
  },
  {
    title: "Chemical Engineer",
    titleAr: "مهندس كيميائي",
    // TODO(i18n): needs professional translation - currently English fallback.
    descriptionAr: "Scale a reaction that works in a test tube up to a plant that makes thousands of tonnes of it. Design the processes behind clean hydrogen, plastics, fertiliser and medicine.",
    requiredSkillsAr: ["تصميم العمليات", "الديناميكا الحرارية", "هندسة التفاعلات", "سلامة العمليات"],
    educationLevelAr: "بكالوريوس في الهندسة الكيميائية",
  },
  {
    title: "Risk & Compliance Officer",
    titleAr: "مسؤول المخاطر والامتثال",
    // TODO(i18n): needs professional translation - currently English fallback.
    descriptionAr: "Make sure a bank or trading firm is actually following the rules that protect its customers. Investigate suspicious transactions and stop financial crime before the money moves.",
    requiredSkillsAr: ["التحليل التنظيمي", "مكافحة غسل الأموال", "التحقيق", "كتابة التقارير"],
    educationLevelAr: "بكالوريوس في المالية أو القانون أو المحاسبة أو إدارة الأعمال",
  },
  {
    title: "Geneticist",
    titleAr: "عالم وراثة",
    // TODO(i18n): needs professional translation - currently English fallback.
    descriptionAr: "Read the DNA that makes each person unique and find the tiny changes that cause disease. Turn genome data into treatments doctors can actually give a patient.",
    requiredSkillsAr: ["البيولوجيا الجزيئية", "تحليل الجينوم", "التقنيات المخبرية", "الكتابة العلمية"],
    educationLevelAr: "ماجستير أو دكتوراه في علم الوراثة أو البيولوجيا الجزيئية أو الجينوم",
  },
  {
    title: "Health Informatics Specialist",
    titleAr: "أخصائي المعلوماتية الصحية",
    // TODO(i18n): needs professional translation - currently English fallback.
    descriptionAr: "Build the systems that put a patient's whole medical history in front of a doctor in one second. Turn scattered hospital records into data that spots illness earlier.",
    requiredSkillsAr: ["أنظمة البيانات الصحية", "تحليل سير العمل السريري", "خصوصية البيانات", "تصميم قواعد البيانات"],
    educationLevelAr: "بكالوريوس أو ماجستير في المعلوماتية الصحية أو علوم الحاسب أو الصحة العامة",
  },
  {
    title: "Hospitality Manager",
    titleAr: "مدير ضيافة",
    // TODO(i18n): needs professional translation - currently English fallback.
    descriptionAr: "Run a hotel so well that guests from thirty countries all feel looked after. Lead the front-desk, housekeeping and events teams, and fix problems before anyone notices them.",
    requiredSkillsAr: ["إدارة العمليات", "علاقات الضيوف", "قيادة الفريق", "إعداد الميزانيات"],
    educationLevelAr: "بكالوريوس في إدارة الضيافة أو إدارة الأعمال",
  },
  {
    title: "Tourism & Events Manager",
    titleAr: "مدير سياحة وفعاليات",
    // TODO(i18n): needs professional translation - currently English fallback.
    descriptionAr: "Plan the conferences, festivals and world expos that bring thousands of visitors into a city. Handle the venues, budgets and schedules so that on the day everything simply works.",
    requiredSkillsAr: ["تخطيط الفعاليات", "التفاوض مع الموردين", "تنسيق اللوجستيات", "إدارة الميزانية"],
    educationLevelAr: "بكالوريوس في إدارة الفعاليات أو السياحة أو الضيافة أو إدارة الأعمال",
  },
  {
    title: "Airline Pilot",
    titleAr: "طيار خطوط جوية",
    // TODO(i18n): needs professional translation - currently English fallback.
    descriptionAr: "Fly a three-hundred-tonne aircraft full of people safely across continents. Read the weather, the systems and the fuel, and make the calls that keep everyone on board safe.",
    requiredSkillsAr: ["عمليات الطيران", "الملاحة", "الوعي الظرفي", "تنسيق الطاقم"],
    educationLevelAr: "رخصة طيار نقل جوي (ATPL) مع تدريب في أكاديمية طيران، ويُفضّل عادةً وجود شهادة بكالوريوس",
  },
  {
    title: "Agricultural Scientist (Agronomist)",
    titleAr: "عالم زراعي (مهندس محاصيل)",
    // TODO(i18n): needs professional translation - currently English fallback.
    descriptionAr: "Work out how to grow food in one of the hottest, driest places on Earth. Study soil, water and crop genetics to make desert farming produce more with less, so the country can feed itself.",
    requiredSkillsAr: ["علم التربة", "إدارة المحاصيل", "التجارب الحقلية", "تحليل البيانات"],
    educationLevelAr: "بكالوريوس أو ماجستير في العلوم الزراعية أو علم المحاصيل",
  },
  {
    title: "Food Technologist",
    titleAr: "تقني أغذية",
    // TODO(i18n): needs professional translation - currently English fallback.
    descriptionAr: "Invent food that stays fresh longer, tastes better and is safe to eat months after it leaves the factory. Test what is really inside a product and design the process that makes it at scale.",
    requiredSkillsAr: ["كيمياء الأغذية", "ضمان الجودة", "تطوير المنتجات", "معايير سلامة الغذاء"],
    educationLevelAr: "بكالوريوس في علوم الأغذية أو تقنية الأغذية أو الكيمياء",
  },
  {
    title: "Agricultural Engineer",
    titleAr: "مهندس زراعي",
    // TODO(i18n): needs professional translation - currently English fallback.
    descriptionAr: "Engineer the indoor farms that grow lettuce in the desert using ninety percent less water. Design the irrigation, climate control and machinery that make food production possible where nothing should grow.",
    requiredSkillsAr: ["أنظمة الري", "تصميم البيئات المتحكم بها", "هندسة الآلات", "كفاءة الموارد"],
    educationLevelAr: "بكالوريوس في الهندسة الزراعية أو هندسة النظم الحيوية",
  },
  {
    title: "Satellite & Remote Sensing Scientist",
    titleAr: "عالم أقمار صناعية واستشعار عن بُعد",
    // TODO(i18n): needs professional translation - currently English fallback.
    descriptionAr: "Turn pictures taken from orbit into answers about the planet below. Track shrinking water, growing cities and dust storms using satellite data nobody else has looked at yet.",
    requiredSkillsAr: ["تحليل صور الأقمار الصناعية", "النظم الجغرافية المكانية", "معالجة البيانات", "النمذجة العلمية"],
    educationLevelAr: "بكالوريوس أو ماجستير في الاستشعار عن بُعد أو الجيوماتكس أو علوم الأرض",
  },
  {
    title: "Film & TV Producer",
    titleAr: "منتج أفلام وتلفزيون",
    // TODO(i18n): needs professional translation - currently English fallback.
    descriptionAr: "Take a story from a first idea to something millions of people watch. Pick the crew, hold the budget and make the hundred daily decisions that decide how the finished film feels.",
    requiredSkillsAr: ["تخطيط الإنتاج", "السرد القصصي", "إدارة الفريق", "إدارة الميزانية"],
    educationLevelAr: "بكالوريوس في السينما أو الإنتاج الإعلامي أو الاتصال",
  },
  {
    title: "Data Engineer",
    titleAr: "مهندس بيانات",
    // TODO(i18n): needs professional translation - currently English fallback.
    descriptionAr: "Build the pipelines and databases that move billions of records without losing one. Design the foundations every dashboard, app and AI model quietly depends on.",
    requiredSkillsAr: ["نمذجة البيانات", "SQL وخطوط البيانات", "منصات البيانات السحابية", "تحسين الأداء"],
    educationLevelAr: "بكالوريوس في علوم الحاسب أو نظم المعلومات أو هندسة البيانات",
  },
  {
    title: "Atmospheric & Space Scientist",
    titleAr: "عالم الغلاف الجوي والفضاء",
    // TODO(i18n): needs professional translation - currently English fallback.
    descriptionAr: "Forecast dust storms, study how clouds form and test whether you can make it rain over a desert. Use satellites and physics to predict an atmosphere that affects everyone's day.",
    requiredSkillsAr: ["فيزياء الغلاف الجوي", "النمذجة العددية", "تحليل البيانات", "الأجهزة العلمية"],
    educationLevelAr: "بكالوريوس أو ماجستير في علوم الغلاف الجوي أو الأرصاد الجوية أو الفيزياء",
  },
  {
    title: "Physicist",
    titleAr: "فيزيائي",
    // TODO(i18n): needs professional translation - currently English fallback.
    descriptionAr: "Ask how the universe actually works and then design the experiment that answers it. Work on quantum computers, lasers and materials that did not exist five years ago.",
    requiredSkillsAr: ["الفيزياء النظرية", "تصميم التجارب", "التحليل الرياضي", "الحوسبة العلمية"],
    educationLevelAr: "ماجستير أو دكتوراه في الفيزياء",
  },
  {
    title: "Environmental Engineer",
    titleAr: "مهندس بيئي",
    // TODO(i18n): needs professional translation - currently English fallback.
    descriptionAr: "Design the systems that clean a city's water, cut its emissions and deal with its waste. Solve pollution problems with engineering instead of hoping someone else will.",
    requiredSkillsAr: ["تصميم معالجة المياه", "النمذجة البيئية", "إدارة النفايات", "الامتثال التنظيمي"],
    educationLevelAr: "بكالوريوس في الهندسة البيئية أو المدنية",
  },
  {
    title: "Actuary",
    titleAr: "خبير اكتواري",
    // TODO(i18n): needs professional translation - currently English fallback.
    descriptionAr: "Put a price on risk: how likely a flood is, how long people live, what an insurer should charge. Use probability and huge datasets to make decisions worth billions.",
    requiredSkillsAr: ["الاحتمالات والإحصاء", "نمذجة المخاطر", "الرياضيات المالية", "تحليل البيانات"],
    educationLevelAr: "بكالوريوس في العلوم الاكتوارية أو الرياضيات أو الإحصاء مع اجتياز الاختبارات المهنية",
  },
  {
    title: "Investment & Financial Manager",
    titleAr: "مدير استثمار ومالية",
    // TODO(i18n): needs professional translation - currently English fallback.
    descriptionAr: "Decide where an organisation's money goes and make it grow. Read the markets, plan the funding and answer for the numbers when the results are published.",
    requiredSkillsAr: ["التحليل المالي", "استراتيجية الاستثمار", "التنبؤ المالي", "التواصل مع أصحاب المصلحة"],
    educationLevelAr: "بكالوريوس أو ماجستير في المالية أو الاقتصاد أو إدارة الأعمال",
  },
  {
    title: "Primary School Teacher",
    titleAr: "معلم مرحلة ابتدائية",
    // TODO(i18n): needs professional translation - currently English fallback.
    descriptionAr: "Teach a child to read, add up and ask questions in the years when it matters most. Build the confidence and curiosity that everything they learn afterwards is stacked on.",
    requiredSkillsAr: ["تخطيط الدروس", "إدارة الصف", "نمو الطفل", "التقييم"],
    educationLevelAr: "بكالوريوس في التربية أو التعليم الابتدائي مع رخصة تدريس",
  },
  {
    title: "School Counsellor & Career Advisor",
    titleAr: "مرشد طلابي ومستشار مهني",
    // TODO(i18n): needs professional translation - currently English fallback.
    descriptionAr: "Help students work out who they are and what they could do next. Sit with a teenager who has no idea what to choose, and give them a real, honest path forward.",
    requiredSkillsAr: ["الإرشاد النفسي", "التقييم المهني", "الإصغاء الفعّال", "الدفاع عن الطلاب"],
    educationLevelAr: "بكالوريوس أو ماجستير في الإرشاد أو علم النفس أو التربية",
  },
  {
    title: "Curriculum & Instructional Designer",
    titleAr: "مصمم مناهج وتعليم",
    // TODO(i18n): needs professional translation - currently English fallback.
    descriptionAr: "Design what gets taught and how, for a whole school or a whole country. Turn a subject into lessons, materials and assessments that actually work in a real classroom.",
    requiredSkillsAr: ["تصميم المناهج", "تقييم التعلم", "تدريب المعلمين", "تقنيات التعليم"],
    educationLevelAr: "ماجستير في المناهج وطرق التدريس أو التربية",
  },
  {
    title: "Cloud & Network Architect",
    titleAr: "مهندس معماري للشبكات والحوسبة السحابية",
    // TODO(i18n): needs professional translation - currently English fallback.
    descriptionAr: "Design the networks and cloud systems that carry a company's entire business without falling over. Plan the capacity, the security and the backup for the day something breaks.",
    requiredSkillsAr: ["تصميم الشبكات", "البنية السحابية", "أمن الأنظمة", "تخطيط السعة"],
    educationLevelAr: "بكالوريوس في علوم الحاسب أو هندسة الشبكات أو تقنية المعلومات",
  },
  {
    title: "Industrial Engineer",
    titleAr: "مهندس صناعي",
    // TODO(i18n): needs professional translation - currently English fallback.
    descriptionAr: "Find the wasted time, money and material inside a factory or hospital and design it out. Redesign how work flows so the same people produce far more with less effort.",
    requiredSkillsAr: ["تحسين العمليات", "تحليل العمليات التشغيلية", "أنظمة الجودة", "تصميم سلاسل التوريد"],
    educationLevelAr: "بكالوريوس في الهندسة الصناعية أو التصنيع أو هندسة النظم",
  },
  {
    title: "Video Editor",
    titleAr: "محرر فيديو",
    // TODO(i18n): needs professional translation - currently English fallback.
    descriptionAr: "Cut hours of raw footage into something people cannot stop watching. Choose every shot, sound and pause so a story lands exactly the way it was meant to.",
    requiredSkillsAr: ["مونتاج الفيديو", "تصحيح الألوان والصوت", "السرد البصري", "سير عمل ما بعد الإنتاج"],
    educationLevelAr: "بكالوريوس في السينما أو الإنتاج الإعلامي أو معرض أعمال قوي",
  },
  {
    title: "Dietitian & Nutritionist",
    titleAr: "أخصائي تغذية",
    // TODO(i18n): needs professional translation - currently English fallback.
    descriptionAr: "Work out exactly what someone should eat to manage diabetes, recover from surgery or perform as an athlete. Turn food science into a plan a real person can follow.",
    requiredSkillsAr: ["التغذية السريرية", "التقييم الغذائي", "إرشاد المرضى", "علوم الأغذية"],
    educationLevelAr: "بكالوريوس في التغذية العلاجية أو التغذية مع تدريب عملي مُشرف عليه وترخيص مهني",
  },
];

export const CANONICAL_CAREER_TITLES: Set<string> = new Set(
  CAREER_ARABIC_CONTENT.map(c => c.title)
);

export async function applyCareerArabicContent(): Promise<void> {
  console.log('Applying Arabic content for careers...');
  let updated = 0;
  let notFound = 0;

  for (const item of CAREER_ARABIC_CONTENT) {
    const results = await db
      .select({ id: careers.id })
      .from(careers)
      .where(eq(careers.title, item.title))
      .limit(1);

    if (results.length === 0) {
      console.warn(`  ⚠ Career not found: "${item.title}"`);
      notFound++;
      continue;
    }

    await db
      .update(careers)
      .set({
        titleAr: item.titleAr,
        descriptionAr: item.descriptionAr,
        requiredSkillsAr: item.requiredSkillsAr,
        educationLevelAr: item.educationLevelAr,
      })
      .where(eq(careers.id, results[0].id));
    updated++;
  }

  console.log(`Career Arabic content: ${updated} updated, ${notFound} not found`);
}
