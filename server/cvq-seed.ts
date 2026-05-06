/**
 * Children's Values Questionnaire (CVQ) Seed Data
 * Based on Schwartz's Portrait Values Questionnaire (PVQ-40)
 * Adapted for ages 13-18 school students
 * 
 * 21 questions total: 3 per domain across 7 value domains
 * Response scale: 1-5 Likert (Not like me → Very much like me)
 * 
 * ID format: CVQ-<DomainCode><Position>
 *   A  = Achievement, B = Benevolence, U = Universalism
 *   SD = Self-Direction, SE = Security, P = Power, H = Hedonism
 */

import { db } from './db';
import { cvqItems, type InsertCvqItem } from '../shared/schema';
import { eq } from 'drizzle-orm';

// CVQ Items based on validated PVQ-40 items, adapted for youth
export const CVQ_SEED_DATA: InsertCvqItem[] = [
  // ACHIEVEMENT - Personal success through demonstrating competence (3 items)
  {
    id: 'CVQ-A1',
    domain: 'achievement',
    position: 1,
    text: "It's very important to me to show my abilities. I want people to admire what I do.",
    textAr: "يُعدّ إظهار قدراتي أمراً بالغ الأهمية بالنسبة لي. أريد أن يُعجب الناس بما أفعله.",
    version: '1.0.0',
  },
  {
    id: 'CVQ-A2',
    domain: 'achievement',
    position: 2,
    text: "Being very successful is important to me. I like to impress other people.",
    textAr: "النجاح الكبير مهم جداً لي. أحب أن أُثير إعجاب الآخرين.",
    version: '1.0.0',
  },
  {
    id: 'CVQ-A3',
    domain: 'achievement',
    position: 3,
    text: "It is important to me to be ambitious. I want to show how capable I am.",
    textAr: "من المهم بالنسبة لي أن أكون طموحاً. أريد أن أُثبت مدى قدرتي.",
    version: '1.0.0',
  },

  // BENEVOLENCE - Preserving and enhancing the welfare of people close to you (3 items)
  {
    id: 'CVQ-B1',
    domain: 'benevolence',
    position: 1,
    text: "It's very important to me to help the people around me. I want to care for their well-being.",
    textAr: "مساعدة من حولي أمر بالغ الأهمية بالنسبة لي. أريد أن أهتم برفاهيتهم.",
    version: '1.0.0',
  },
  {
    id: 'CVQ-B2',
    domain: 'benevolence',
    position: 2,
    text: "It is important to me to be loyal to my friends. I want to devote myself to people close to me.",
    textAr: "من المهم بالنسبة لي أن أكون مخلصاً لأصدقائي. أريد أن أُكرّس نفسي للأشخاص المقربين مني.",
    version: '1.0.0',
  },
  {
    id: 'CVQ-B3',
    domain: 'benevolence',
    position: 3,
    text: "It is important to me to respond to the needs of others. I try to support those I know.",
    textAr: "من المهم بالنسبة لي أن أستجيب لاحتياجات الآخرين. أحاول دعم من أعرفهم.",
    version: '1.0.0',
  },

  // UNIVERSALISM - Understanding, appreciation, tolerance, and protection for all people and nature (3 items)
  {
    id: 'CVQ-U1',
    domain: 'universalism',
    position: 1,
    text: "I think it's important that every person in the world be treated equally. Everyone should have equal opportunities in life.",
    textAr: "أعتقد أن المعاملة المتساوية لكل شخص في العالم أمر مهم. يجب أن تتاح للجميع فرص متساوية في الحياة.",
    version: '1.0.0',
  },
  {
    id: 'CVQ-U2',
    domain: 'universalism',
    position: 2,
    text: "I strongly believe that people should care for nature. Looking after the environment is important to me.",
    textAr: "أؤمن بشدة بأن على الناس الاهتمام بالطبيعة. إن الحفاظ على البيئة أمر مهم بالنسبة لي.",
    version: '1.0.0',
  },
  {
    id: 'CVQ-U3',
    domain: 'universalism',
    position: 3,
    text: "I believe all the world's people should live in harmony. Promoting peace among all groups in the world is important to me.",
    textAr: "أعتقد أن جميع شعوب العالم يجب أن تعيش في وئام. تعزيز السلام بين جميع الفئات في العالم أمر مهم بالنسبة لي.",
    version: '1.0.0',
  },

  // SELF-DIRECTION - Independent thought and action (3 items)
  {
    id: 'CVQ-SD1',
    domain: 'self_direction',
    position: 1,
    text: "Thinking up new ideas and being creative is important to me. I like to do things in my own original way.",
    textAr: "ابتكار أفكار جديدة والإبداع أمر مهم بالنسبة لي. أحب القيام بالأشياء بطريقتي الأصيلة الخاصة.",
    version: '1.0.0',
  },
  {
    id: 'CVQ-SD2',
    domain: 'self_direction',
    position: 2,
    text: "It is important to me to make my own decisions about what I do. I like to be free to plan and choose my activities for myself.",
    textAr: "من المهم بالنسبة لي اتخاذ قراراتي الخاصة حول ما أفعله. أحب أن أكون حراً في التخطيط لأنشطتي واختيارها بنفسي.",
    version: '1.0.0',
  },
  {
    id: 'CVQ-SD3',
    domain: 'self_direction',
    position: 3,
    text: "I think it's important to be interested in things. I like to be curious and try to understand all sorts of things.",
    textAr: "أعتقد أنه من المهم أن تكون مهتماً بالأمور. أحب أن أكون فضولياً وأحاول فهم كل أنواع الأشياء.",
    version: '1.0.0',
  },

  // SECURITY - Safety, harmony, and stability of society, relationships, and self (3 items)
  {
    id: 'CVQ-SE1',
    domain: 'security',
    position: 1,
    text: "It is important to me to live in secure surroundings. I avoid anything that might endanger my safety.",
    textAr: "من المهم بالنسبة لي أن أعيش في بيئة آمنة. أتجنب أي شيء قد يهدد سلامتي.",
    version: '1.0.0',
  },
  {
    id: 'CVQ-SE2',
    domain: 'security',
    position: 2,
    text: "It is very important to me that my country be safe. I think the state must be on watch against threats from within and without.",
    textAr: "أمن وطني أمر بالغ الأهمية بالنسبة لي. أعتقد أن الدولة يجب أن تبقى يقظة تجاه التهديدات الداخلية والخارجية.",
    version: '1.0.0',
  },
  {
    id: 'CVQ-SE3',
    domain: 'security',
    position: 3,
    text: "I try hard to avoid getting sick. Staying healthy is very important to me.",
    textAr: "أبذل جهداً كبيراً لتجنب المرض. الحفاظ على الصحة أمر بالغ الأهمية بالنسبة لي.",
    version: '1.0.0',
  },

  // POWER - Social status, prestige, control over people and resources (3 items)
  {
    id: 'CVQ-P1',
    domain: 'power',
    position: 1,
    text: "It is important to me to be rich. I want to have a lot of money and expensive things.",
    textAr: "من المهم بالنسبة لي أن أكون غنياً. أريد امتلاك الكثير من المال والأشياء الثمينة.",
    version: '1.0.0',
  },
  {
    id: 'CVQ-P2',
    domain: 'power',
    position: 2,
    text: "It is important to me to get respect from others. I want people to do what I say.",
    textAr: "من المهم بالنسبة لي أن أحظى باحترام الآخرين. أريد أن يُنفّذ الناس ما أقوله.",
    version: '1.0.0',
  },
  {
    id: 'CVQ-P3',
    domain: 'power',
    position: 3,
    text: "I always want to be the one who makes the decisions. I like to be the leader.",
    textAr: "أريد دائماً أن أكون من يتخذ القرارات. أحب أن أكون قائداً.",
    version: '1.0.0',
  },

  // HEDONISM - Pleasure and sensuous gratification for oneself (3 items)
  {
    id: 'CVQ-H1',
    domain: 'hedonism',
    position: 1,
    text: "I seek every chance I can to have fun. It is important to me to do things that give me pleasure.",
    textAr: "أتحرى كل فرصة للاستمتاع. من المهم بالنسبة لي القيام بالأشياء التي تجلب لي السعادة.",
    version: '1.0.0',
  },
  {
    id: 'CVQ-H2',
    domain: 'hedonism',
    position: 2,
    text: "Enjoying life's pleasures is important to me. I like to spoil myself.",
    textAr: "الاستمتاع بملذات الحياة أمر مهم بالنسبة لي. أحب أن أُدلّل نفسي.",
    version: '1.0.0',
  },
  {
    id: 'CVQ-H3',
    domain: 'hedonism',
    position: 3,
    text: "I really want to enjoy life. Having a good time is very important to me.",
    textAr: "أريد حقاً أن أستمتع بالحياة. قضاء وقت ممتع أمر بالغ الأهمية بالنسبة لي.",
    version: '1.0.0',
  },
];

/**
 * Seed CVQ items into database
 * Should be called during initial database seeding
 */
export async function seedCVQItems() {
  console.log('📋 Seeding CVQ items...');

  try {
    const existingItems = await db.select({ id: cvqItems.id }).from(cvqItems);

    if (existingItems.length > 0) {
      // Items exist — update textAr for all 21 items
      let updatedCount = 0;
      for (const item of CVQ_SEED_DATA) {
        if (item.textAr) {
          await db
            .update(cvqItems)
            .set({ textAr: item.textAr })
            .where(eq(cvqItems.id, item.id));
          updatedCount++;
        }
      }
      console.log(`✓ Updated Arabic translations for ${updatedCount} existing CVQ items`);
      return;
    }

    // First-time seed — insert all items
    await db.insert(cvqItems).values(CVQ_SEED_DATA as any);
    console.log(`✓ Created ${CVQ_SEED_DATA.length} CVQ items (7 domains × 3 questions) with Arabic translations`);
    console.log('  Domains: Achievement, Benevolence, Universalism, Self-Direction, Security, Power, Hedonism');
  } catch (error) {
    console.error('Error seeding CVQ items:', error);
    throw error;
  }
}
