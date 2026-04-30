import { Switch } from "@/components/ui/switch"

const SwitchContainer = ({
  value,
  onCheckedChange,
  activeText,
  inactiveText,
  defaultChecked,
}: {
  value: boolean;
  onCheckedChange: (value: boolean) => void;
  activeText?: string;
  inactiveText?: string;
  defaultChecked?: boolean;
}) => {
  return (
    <div className="flex items-center gap-2 h-10">
      <Switch
        checked={value}
        onCheckedChange={onCheckedChange}
        defaultChecked={defaultChecked}
      />
      <p className="text-sm text-primary-foreground/80">{value ? activeText : inactiveText}</p>
    </div>
  );
};

export default SwitchContainer;
