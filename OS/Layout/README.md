# Hypercho OS Layout System

## Header System

The header system in Hypercho OS has been redesigned to be more flexible and support multiple UI patterns. The new system replaces the old `leftButtons`, `centerTabs`, `rightButtons`, and `search` properties with a more flexible structure.

## New Header Structure

### AppHeader Interface

```typescript
interface AppHeader {
  title?: string;
  icon?: IconType | LucideIcon;
  leftUI?: HeaderButtonsConfig;
  centerUI?: CenterUIConfig;
  rightUI?: HeaderButtonsConfig;
}
```

### UI Configuration Types

#### HeaderButtonsConfig

```typescript
interface HeaderButtonsConfig {
  type: "buttons";
  buttons: HeaderButton[];
  className?: string;
}

interface HeaderButton {
  id: string;
  label: string;
  icon?: React.ReactNode;
  onClick?: () => void;
  className?: string;
  variant?:
    | "default"
    | "destructive"
    | "outline"
    | "secondary"
    | "ghost"
    | "link"
    | "background"
    | "primary"
    | "accent"
    | "active"
    | "loading"
    | "icon"
    | "success"
    | "input"
    | "selectItem";
  disabled?: boolean;
  dialog?: DialogType;
}

interface DialogType {
  id: string;
  data?: Record<string, any>;
}
```

#### HeaderTabsConfig (using shadcn/ui Tabs)

```typescript
interface HeaderTabsConfig {
  type: "tabs";
  tabs: HeaderTabItem[];
  activeValue: string;
  onValueChange: (value: string) => void;
  className?: string;
}

interface HeaderTabItem {
  id: string;
  label: string;
  icon?: IconType | LucideIcon;
  value: string;
  content?: React.ReactNode;
}
```

#### HeaderBreadcrumbsConfig

```typescript
interface HeaderBreadcrumbsConfig {
  type: "breadcrumbs";
  breadcrumbs?: BreadcrumbItem[];
  className?: string;
}
```

#### HeaderSearchConfig

```typescript
interface HeaderSearchConfig {
  type: "search";
  search: HeaderSearch;
  className?: string;
}
```

## Usage Examples

### 1. Tabs in Center (using shadcn/ui Tabs)

```typescript
const appSchema: AppSchema = {
  header: {
    title: "My App",
    icon: Home,
    centerUI: {
      type: "tabs",
      tabs: [
        {
          id: "overview",
          label: "Overview",
          icon: Home,
          value: "overview",
        },
        {
          id: "documents",
          label: "Documents",
          icon: FileText,
          value: "documents",
        },
      ],
      activeValue: "overview",
      onValueChange: (value: string) => {
        console.log("Tab changed to:", value);
        // Handle tab change logic
      },
    },
    rightUI: {
      type: "buttons",
      buttons: [
        {
          id: "add",
          label: "Add",
          icon: <Plus className="w-4 h-4" />,
          variant: "accent",
          onClick: () => console.log("Add clicked"),
        },
      ],
    },
  },
};
```

### 2. Dialog Activation in Header Buttons

```typescript
const appSchema: AppSchema = {
  header: {
    rightUI: {
      type: "buttons",
      buttons: [
        {
          id: "settings",
          label: "Settings",
          icon: <Settings className="w-4 h-4" />,
          variant: "ghost",
          dialog: {
            id: "settings-dialog",
            data: { section: "general" },
          },
          onClick: () => console.log("Settings button clicked"),
        },
        {
          id: "new-item",
          label: "New Item",
          icon: <Plus className="w-4 h-4" />,
          variant: "accent",
          dialog: {
            id: "create-item-dialog",
            data: { type: "document" },
          },
        },
      ],
    },
  },
  dialogs: [
    {
      id: "settings-dialog",
      title: "Settings",
      type: "form",
      content: {
        // Form schema configuration
      },
      actions: {
        primary: {
          id: "save",
          label: "Save",
          onClick: (data) => console.log("Save settings:", data),
        },
        close: {
          id: "cancel",
          label: "Cancel",
          variant: "ghost",
        },
      },
    },
    {
      id: "create-item-dialog",
      title: "Create New Item",
      type: "form",
      content: {
        // Form schema configuration
      },
      actions: {
        primary: {
          id: "create",
          label: "Create",
          onClick: (data) => console.log("Create item:", data),
        },
        close: {
          id: "cancel",
          label: "Cancel",
          variant: "ghost",
        },
      },
    },
  ],
};
```

### 3. Breadcrumbs in Center

```typescript
const appSchema: AppSchema = {
  header: {
    centerUI: {
      type: "breadcrumbs",
      breadcrumbs: [
        { label: "Home", onClick: () => navigate("/") },
        { label: "Documents", onClick: () => navigate("/documents") },
        { label: "Current Page" }, // No onClick for current page
      ],
    },
  },
};
```

### 4. Search in Center

```typescript
const appSchema: AppSchema = {
  header: {
    centerUI: {
      type: "search",
      search: {
        placeholder: "Search files, folders, and more...",
        onSearch: (value: string) => {
          console.log("Searching for:", value);
          // Handle search logic
        },
        defaultValue: "",
      },
    },
  },
};
```

### 5. Buttons in Center

```typescript
const appSchema: AppSchema = {
  header: {
    centerUI: {
      type: "buttons",
      buttons: [
        {
          id: "view-grid",
          label: "Grid",
          icon: <Grid className="w-4 h-4" />,
          variant: "secondary",
          onClick: () => setViewMode("grid"),
        },
        {
          id: "view-list",
          label: "List",
          icon: <List className="w-4 h-4" />,
          variant: "ghost",
          onClick: () => setViewMode("list"),
        },
      ],
    },
  },
};
```

## Migration from Old Structure

The system automatically migrates from the old structure to the new one. If you're using the old properties (`leftButtons`, `centerTabs`, `rightButtons`, `search`), they will be automatically converted:

- `leftButtons` → `leftUI: { type: "buttons", buttons: [...] }`
- `rightButtons` → `rightUI: { type: "buttons", buttons: [...] }`
- `centerTabs` → `centerUI: { type: "tabs", tabs: [...], activeValue: "...", onValueChange: ... }`
- `search` → `centerUI: { type: "search", search: {...} }`

## Key Features

1. **Flexible Center UI**: Choose between tabs, buttons, breadcrumbs, or search
2. **shadcn/ui Integration**: Tabs use the official shadcn/ui Tabs component
3. **Backward Compatibility**: Old structure is automatically migrated
4. **Type Safety**: Full TypeScript support with proper type checking
5. **Customizable**: Each UI type supports custom className for styling
6. **Icon Support**: All UI types support Lucide icons and React Icons
7. **Dialog Integration**: Header buttons can trigger dialogs for complex interactions
8. **Context Menu Support**: Sidebar items support right-click context menus with dialogs

## Best Practices

1. **Use Tabs for Navigation**: When you have multiple related views or sections
2. **Use Breadcrumbs for Hierarchy**: When showing navigation path or file structure
3. **Use Search for Discovery**: When users need to find content quickly
4. **Use Buttons for Actions**: When you have a few related actions in the center
5. **Keep Left/Right UI for Actions**: Use left and right sections for primary actions and settings
6. **Use Dialogs for Complex Interactions**: When buttons need to open forms, confirmations, or complex UI
7. **Combine onClick and Dialog**: You can use both onClick for immediate actions and dialog for additional UI
8. **Pass Context Data**: Use the dialog data property to pass relevant context to the dialog

## Examples

See `HeaderExample.tsx` for complete working examples of all UI types.
