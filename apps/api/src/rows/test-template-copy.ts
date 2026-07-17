export type TestTemplateLocale = "tr" | "en";

export interface TestTemplateCopy {
  sectionTitles: [string, string, string, string];
  defaultContent: string;
}

const COPY: Record<TestTemplateLocale, TestTemplateCopy> = {
  tr: {
    sectionTitles: [
      "\u00d6n Ko\u015fullar",
      "Test Girdileri",
      "Varsay\u0131mlar ve K\u0131s\u0131tlamalar",
      "Test Ad\u0131mlar\u0131",
    ],
    defaultContent: "Yoktur.",
  },
  en: {
    sectionTitles: ["Prerequisites", "Test Inputs", "Assumptions and Constraints", "Test Steps"],
    defaultContent: "None.",
  },
};

export function testTemplateCopy(locale: TestTemplateLocale): TestTemplateCopy {
  return COPY[locale];
}
