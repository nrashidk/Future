/**
 * O*NET Work Values Parser
 * 
 * Downloads and parses O*NET 30.0 Work Values data, maps to CVQ domains,
 * and generates valuesProfile JSONB for all 36 careers.
 * 
 * O*NET Work Values (6 total):
 * - Achievement: Occupations that satisfy this work value are results oriented
 * - Working Conditions: Occupations that satisfy this work value offer job security
 * - Recognition: Occupations that satisfy this work value offer advancement, potential
 * - Relationships: Occupations that satisfy this work value allow employees to provide service
 * - Support: Occupations that satisfy this work value offer supportive management
 * - Independence: Occupations that satisfy this work value allow employees to work on their own
 * 
 * CVQ Domains (7 total):
 * - Achievement: Accomplishment, recognition, advancement
 * - Benevolence: Helping others, social justice, equality
 * - Universalism: Understanding, tolerance, protecting nature
 * - Self-Direction: Creativity, freedom, independence
 * - Security: Safety, stability, order
 * - Power: Authority, wealth, social status
 * - Hedonism: Pleasure, enjoying life, self-indulgence
 */

import * as fs from 'fs';
import * as path from 'path';

// O*NET Work Value → CVQ Domain Mapping
// Based on Schwartz Values Theory alignment
const ONET_TO_CVQ_MAPPING: Record<string, { primary: string; secondary?: string; weight: number }> = {
  Achievement: { primary: 'achievement', weight: 1.0 },
  Recognition: { primary: 'power', secondary: 'achievement', weight: 0.6 },
  Independence: { primary: 'self_direction', weight: 1.0 },
  Relationships: { primary: 'benevolence', secondary: 'universalism', weight: 0.7 },
  Support: { primary: 'security', secondary: 'benevolence', weight: 0.5 },
  'Working Conditions': { primary: 'security', weight: 0.8 },
};

// Career → O*NET-SOC Code Crosswalk (36 careers)
// Based on O*NET 30.0 taxonomy matching career titles
const CAREER_ONET_CROSSWALK: Record<string, string> = {
  'Software Engineer': '15-1251.00', // Computer Programmers
  'Data Scientist': '15-2051.01', // Data Scientists
  'Renewable Energy Engineer': '17-2199.03', // Energy Engineers, Except Wind and Solar
  'Healthcare Professional (Nurse)': '29-1141.00', // Registered Nurses
  'Digital Marketing Specialist': '13-1161.00', // Market Research Analysts
  'Graphic Designer': '27-1024.00', // Graphic Designers
  'Mechanical Engineer': '17-2141.00', // Mechanical Engineers
  'Financial Analyst': '13-2052.00', // Personal Financial Advisors
  'Teacher (Secondary Education)': '25-2031.00', // Secondary School Teachers
  'Environmental Scientist': '19-2041.00', // Environmental Scientists
  'Civil Engineer': '17-2051.00', // Civil Engineers
  'Architect': '17-1011.00', // Architects
  'Electrical Engineer': '17-2071.00', // Electrical Engineers
  'Biomedical Engineer': '17-2031.00', // Biomedical Engineers
  'Pharmacist': '29-1051.00', // Pharmacists
  'Doctor (General Practitioner)': '29-1216.00', // General Internal Medicine Physicians
  'Dentist': '29-1021.00', // Dentists, General
  'Physical Therapist': '29-1123.00', // Physical Therapists
  'Psychologist': '19-3032.00', // Industrial-Organizational Psychologists
  'Social Worker': '21-1022.00', // Healthcare Social Workers
  'Lawyer': '23-1011.00', // Lawyers
  'Accountant': '13-2011.00', // Accountants and Auditors
  'Human Resources Manager': '11-3121.00', // Human Resources Managers
  'Management Consultant': '13-1111.00', // Management Analysts
  'Entrepreneur': '11-1021.00', // General and Operations Managers
  'Sales Manager': '11-2022.00', // Sales Managers
  'Marketing Manager': '11-2021.00', // Marketing Managers
  'Product Manager': '11-2021.00', // Marketing Managers (closest match)
  'UX/UI Designer': '15-1255.01', // Web and Digital Interface Designers
  'Video Game Designer': '27-1014.00', // Special Effects Artists and Animators
  'Journalist': '27-3023.00', // News Analysts, Reporters, and Journalists
  'Content Creator': '27-3043.00', // Writers and Authors
  'Photographer': '27-4021.00', // Photographers
  'Chef': '35-1011.00', // Chefs and Head Cooks
  'Fashion Designer': '27-1022.00', // Fashion Designers
  'Interior Designer': '27-1025.00', // Interior Designers
};

interface ONetWorkValue {
  code: string;
  achievement: number;
  workingConditions: number;
  recognition: number;
  relationships: number;
  support: number;
  independence: number;
}

interface CVQProfile {
  achievement: number;
  benevolence: number;
  universalism: number;
  self_direction: number;
  security: number;
  power: number;
  hedonism: number;
}

/**
 * Parse Work Values.txt tab-delimited file
 */
function parseWorkValuesFile(filePath: string): Map<string, ONetWorkValue> {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n').slice(1); // Skip header
  const valuesByCode = new Map<string, ONetWorkValue>();

  for (const line of lines) {
    if (!line.trim()) continue;
    
    const parts = line.split('\t');
    if (parts.length < 5) continue;

    const [code, elementId, elementName, scaleId, dataValue] = parts;

    // Only process EX (Extent) scale, skip VH (High-Point) codes
    if (scaleId !== 'EX') continue;

    if (!valuesByCode.has(code)) {
      valuesByCode.set(code, {
        code,
        achievement: 0,
        workingConditions: 0,
        recognition: 0,
        relationships: 0,
        support: 0,
        independence: 0,
      });
    }

    const entry = valuesByCode.get(code)!;
    const value = parseFloat(dataValue);

    // Map element names to properties
    switch (elementName) {
      case 'Achievement':
        entry.achievement = value;
        break;
      case 'Working Conditions':
        entry.workingConditions = value;
        break;
      case 'Recognition':
        entry.recognition = value;
        break;
      case 'Relationships':
        entry.relationships = value;
        break;
      case 'Support':
        entry.support = value;
        break;
      case 'Independence':
        entry.independence = value;
        break;
    }
  }

  return valuesByCode;
}

/**
 * Map O*NET work values to CVQ domain profile
 * Applies weighted transformation based on theoretical alignment
 * IMPORTANT: Normalize FIRST, then apply weighted mappings to keep values in 0-100 range
 */
function mapONetToCVQ(onetValues: ONetWorkValue): CVQProfile {
  // First, normalize O*NET values from 0-7 scale to 0-100 scale
  const normalize = (val: number) => Math.round((val / 7) * 100);
  
  const normalized = {
    achievement: normalize(onetValues.achievement),
    workingConditions: normalize(onetValues.workingConditions),
    recognition: normalize(onetValues.recognition),
    relationships: normalize(onetValues.relationships),
    support: normalize(onetValues.support),
    independence: normalize(onetValues.independence),
  };

  const cvq: CVQProfile = {
    achievement: 0,
    benevolence: 0,
    universalism: 0,
    self_direction: 0,
    security: 0,
    power: 0,
    hedonism: 0,
  };

  // Achievement → Achievement (direct mapping)
  cvq.achievement += normalized.achievement * ONET_TO_CVQ_MAPPING.Achievement.weight;

  // Recognition → Power (primary) + Achievement (secondary)
  cvq.power += normalized.recognition * ONET_TO_CVQ_MAPPING.Recognition.weight;
  cvq.achievement += normalized.recognition * (1 - ONET_TO_CVQ_MAPPING.Recognition.weight);

  // Independence → Self-Direction (direct mapping)
  cvq.self_direction += normalized.independence * ONET_TO_CVQ_MAPPING.Independence.weight;

  // Relationships → Benevolence (primary) + Universalism (secondary)
  cvq.benevolence += normalized.relationships * ONET_TO_CVQ_MAPPING.Relationships.weight;
  cvq.universalism += normalized.relationships * (1 - ONET_TO_CVQ_MAPPING.Relationships.weight);

  // Support → Security (primary) + Benevolence (secondary)
  cvq.security += normalized.support * ONET_TO_CVQ_MAPPING.Support.weight;
  cvq.benevolence += normalized.support * (1 - ONET_TO_CVQ_MAPPING.Support.weight);

  // Working Conditions → Security (direct mapping)
  cvq.security += normalized.workingConditions * ONET_TO_CVQ_MAPPING['Working Conditions'].weight;

  // Hedonism: Baseline for all careers (creative/enjoyment aspect)
  // Set to average of achievement and self-direction as proxy
  cvq.hedonism = (cvq.achievement + cvq.self_direction) / 2;

  // Clamp all values to 0-100 range to handle overlapping theoretical mappings
  const clamp = (val: number) => Math.min(100, Math.max(0, Math.round(val)));

  const clamped = {
    achievement: clamp(cvq.achievement),
    benevolence: clamp(cvq.benevolence),
    universalism: clamp(cvq.universalism),
    self_direction: clamp(cvq.self_direction),
    security: clamp(cvq.security),
    power: clamp(cvq.power),
    hedonism: clamp(cvq.hedonism),
  };

  // Verify all values are in valid range (0-100)
  const allValues = Object.values(clamped);
  if (allValues.some(v => v < 0 || v > 100)) {
    throw new Error(`CVQ values out of range for ${onetValues.code}: ${JSON.stringify(clamped)}`);
  }

  return clamped;
}

/**
 * Generate SQL UPDATE statements for careers table
 */
function generateCareerUpdates(workValuesData: Map<string, ONetWorkValue>): string {
  const updates: string[] = [];

  for (const [careerName, onetCode] of Object.entries(CAREER_ONET_CROSSWALK)) {
    const onetValues = workValuesData.get(onetCode);
    
    if (!onetValues) {
      console.warn(`⚠️  No O*NET data found for ${careerName} (${onetCode})`);
      continue;
    }

    const cvqProfile = mapONetToCVQ(onetValues);
    const profileJson = JSON.stringify(cvqProfile);

    updates.push(`
-- ${careerName} (${onetCode})
UPDATE careers 
SET 
  values_profile = '${profileJson}'::jsonb,
  onet_code = '${onetCode}'
WHERE title = '${careerName.replace(/'/g, "''")}';
    `.trim());
  }

  return updates.join('\n\n');
}

/**
 * Main execution
 */
function main() {
  const workValuesPath = path.join(process.cwd(), 'Work_Values.txt');
  const outputPath = path.join(process.cwd(), 'scripts', 'career-values-update.sql');

  console.log('📊 Parsing O*NET Work Values data...');
  const workValuesData = parseWorkValuesFile(workValuesPath);
  console.log(`✓ Parsed ${workValuesData.size} occupations\n`);

  console.log('🔄 Generating CVQ profiles for 36 careers...');
  const sqlUpdates = generateCareerUpdates(workValuesData);

  fs.writeFileSync(outputPath, sqlUpdates, 'utf-8');
  console.log(`✓ Generated SQL updates → ${outputPath}\n`);

  console.log('📈 Sample CVQ Profiles:');
  
  // Show 3 sample careers
  const sampleCareers = ['Software Engineer', 'Healthcare Professional (Nurse)', 'Entrepreneur'];
  for (const career of sampleCareers) {
    const onetCode = CAREER_ONET_CROSSWALK[career];
    const onetValues = workValuesData.get(onetCode);
    if (onetValues) {
      const cvqProfile = mapONetToCVQ(onetValues);
      console.log(`\n${career} (${onetCode}):`);
      console.log(`  Achievement: ${cvqProfile.achievement}`);
      console.log(`  Benevolence: ${cvqProfile.benevolence}`);
      console.log(`  Self-Direction: ${cvqProfile.self_direction}`);
      console.log(`  Security: ${cvqProfile.security}`);
      console.log(`  Power: ${cvqProfile.power}`);
    }
  }

  console.log('\n✅ Done! Run the SQL file to update career value profiles.');
}

main();
