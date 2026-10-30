import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";
import { useTranslation } from "react-i18next";

export default function NotFound() {
  const { t } = useTranslation();

  return (
    <div className="min-h-dvh w-full flex items-center justify-center bg-background page-transition">
      <Card className="w-full max-w-md mx-4">
        <CardContent className="pt-6">
          <div className="flex mb-4 gap-3 items-start">
            <AlertCircle className="h-8 w-8 text-destructive flex-shrink-0 mt-1" data-testid="icon-404" />
            <h1 className="text-2xl font-bold text-foreground">{t("notFound.title")}</h1>
          </div>

          <p className="mt-4 text-sm text-muted-foreground">
            {t("notFound.message")}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
