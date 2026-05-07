import type { CountryQuestionBank } from "../../../shared/questionTypes";
import { mathematics } from "./mathematics";
import { science } from "./science";
import { english } from "./english";
import { arabic } from "./arabic";
import { socialStudies } from "./socialStudies";
import { computerScience } from "./computerScience";

export const uaeQuestionBank: CountryQuestionBank = {
  countryId: "uae",
  countryName: "United Arab Emirates",
  curriculum: "MoE National", // UAE Ministry of Education National Curriculum
  subjects: [
    mathematics,
    science,
    english,
    arabic,
    socialStudies,
    computerScience
  ]
};
