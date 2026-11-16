import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { SettingField } from "./SettingField";
import { keysOnPage, type DisplaySettings, type SettingKey, type SettingsPage } from "./settings";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: DisplaySettings;
  /** Settings that cannot be changed now, with why. */
  locked?: Partial<Record<SettingKey, string>>;
  onChange: <K extends SettingKey>(key: K, value: DisplaySettings[K]) => void;
}

type Page = Exclude<SettingsPage, "timer">;

/** The main page holds the everyday settings; Advanced settings replaces it in the same panel, with Back to return. */
export const SettingsSheet = ({ open, onOpenChange, settings, locked = {}, onChange }: Props) => {
  const [page, setPage] = useState<Page>("main");
  const advanced = page === "advanced";
  const changeOpen = (next: boolean) => {
    if (!next) setPage("main");
    onOpenChange(next);
  };

  return (
    <Sheet
      open={open}
      onOpenChange={changeOpen}
    >
      <SheetContent className="overflow-y-auto sm:max-w-sm">
        <SheetHeader>
          {advanced && (
            <Button
              variant="ghost"
              size="sm"
              className="-ml-2 self-start"
              onClick={() => setPage("main")}
            >
              <ChevronLeft data-icon="inline-start" />
              Back
            </Button>
          )}
          <SheetTitle>{advanced ? "Advanced settings" : "Display settings"}</SheetTitle>
          <SheetDescription>{advanced ? "Fine-tune pacing, margins and dimming." : "Saved in this browser."}</SheetDescription>
        </SheetHeader>
        <FieldGroup className="px-4 pb-6">
          {keysOnPage(page).map((key) => (
            <SettingField
              key={key}
              setting={key}
              settings={settings}
              lockedBecause={locked[key]}
              onChange={onChange}
            />
          ))}
          {!advanced && (
            <Button
              variant="ghost"
              className="-mx-2.5 mt-3 justify-between"
              onClick={() => setPage("advanced")}
            >
              Advanced settings
              <ChevronRight data-icon="inline-end" />
            </Button>
          )}
        </FieldGroup>
      </SheetContent>
    </Sheet>
  );
};
