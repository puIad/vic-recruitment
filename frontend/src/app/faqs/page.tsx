import { Compass } from "lucide-react"

import { BaseLayout } from "@/components/layouts/base-layout"
import { useTour } from "@/components/tour/use-tour"
import { Button } from "@/components/ui/button"
import { useVic } from "@/lib/vic/store"
import { FAQList } from "./components/faq-list"

import categoriesData from "./data/categories.json"
import faqsData from "./data/faqs.json"
import memberFaqs from "./data/member-faqs.json"

/** a member's own questions, in the order they first appear */
const memberCategories = [{ name: "All" }, ...[...new Set(memberFaqs.map((f) => f.category))].map((name) => ({ name }))]

export default function HelpPage() {
  const member = useVic((s) => s.gate.mode === "member")
  const { start } = useTour()
  return (
    <BaseLayout
      title="Help"
      description={member ? "How My binome works, and the tour again whenever you need it." : "How the recruitment pipeline works, in the team's own terms."}
      watermark="Help"
      actions={
        <Button variant="outline" onClick={start} data-tour="help-replay">
          <Compass /> Replay the tour
        </Button>
      }
    >
      <FAQList faqs={member ? memberFaqs : faqsData} categories={member ? memberCategories : categoriesData} />
    </BaseLayout>
  )
}
