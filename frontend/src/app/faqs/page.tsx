import { BaseLayout } from "@/components/layouts/base-layout"
import { FAQList } from "./components/faq-list"

import categoriesData from "./data/categories.json"
import faqsData from "./data/faqs.json"

export default function HelpPage() {
  return (
    <BaseLayout title="Help" description="How the recruitment pipeline works, in the team's own terms." watermark="Help">
      <FAQList faqs={faqsData} categories={categoriesData} />
    </BaseLayout>
  )
}
