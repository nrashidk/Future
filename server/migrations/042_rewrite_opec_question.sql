-- 042: rewrite the quiz question about the UAE and OPEC.
--
-- The bank asked "What role does the UAE play in OPEC?" and marked "Major oil
-- producer and influential member" correct. The UAE withdrew from OPEC with
-- effect from 1 May 2026, so a Grade 12 student answering correctly was marked
-- wrong and one answering from an old textbook was marked right. Its
-- explanation also called the UAE a founding member, which it never was:
-- OPEC was founded in 1960 and Abu Dhabi joined in 1967.
--
-- Asked as history now, so the answer does not go stale again.
--
-- The source of the question (server/questionBanks/uae/socialStudies.ts) and
-- its Arabic content are changed in the same commit; this is for the row that
-- already exists, which the seed never rewrites.
--
-- The correct option stays FIRST in both languages: the Arabic options are
-- aligned to the English ones by position.
--
-- IDEMPOTENT: matched on the old question text, which is gone after one run.

UPDATE quiz_questions
   SET question       = 'Which statement about the UAE and OPEC is correct?',
       options        = '["It was a member from 1967 until it withdrew in 2026", "It is a founding member and still belongs", "It has never been a member", "It has only ever had observer status"]'::jsonb,
       correct_answer = 'It was a member from 1967 until it withdrew in 2026',
       explanation    = 'Abu Dhabi joined OPEC in 1967 and the membership passed to the UAE when the federation formed in 1971. The UAE withdrew with effect from 1 May 2026 and remains a major oil producer.',
       question_ar    = 'أي العبارات الآتية صحيحة عن الإمارات ومنظمة أوبك؟',
       options_ar     = '["كانت عضواً منذ عام 1967 حتى انسحابها عام 2026", "عضو مؤسس وما زالت في المنظمة", "لم تكن عضواً في أي وقت", "لم يكن لها سوى صفة مراقب"]'::jsonb,
       explanation_ar = 'انضمت أبوظبي إلى أوبك عام 1967 وانتقلت العضوية إلى دولة الإمارات عند قيام الاتحاد عام 1971. انسحبت الإمارات اعتباراً من 1 مايو 2026 وما زالت من كبار منتجي النفط.'
 WHERE question = 'What role does the UAE play in OPEC?';

-- DOWN (manual, not run by the runner):
--   UPDATE quiz_questions
--      SET question       = 'What role does the UAE play in OPEC?',
--          options        = '["Major oil producer and influential member", "Observer status only", "Not a member", "Founding member only with no current role"]'::jsonb,
--          correct_answer = 'Major oil producer and influential member',
--          explanation    = 'The UAE is a founding OPEC member and one of the largest oil producers, playing a key role in global energy markets',
--          question_ar    = 'ما الدور الذي تؤديه الإمارات في منظمة أوبك؟',
--          options_ar     = '["منتج نفطي رئيسي وعضو مؤثر", "عضو مراقب فقط", "ليست عضواً", "عضو مؤسس فقط دون دور حالي"]'::jsonb,
--          explanation_ar = 'الإمارات عضو مؤسس في أوبك وأحد أكبر منتجي النفط مع دور محوري في أسواق الطاقة العالمية'
--    WHERE question = 'Which statement about the UAE and OPEC is correct?';
