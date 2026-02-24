# Custom Widget Headers

This system allows you to create custom headers for different widgets while maintaining all the control functions (maximize, edit mode, etc.). The headers are now integrated directly into the widget components, allowing them to be inside the provider context.

## How It Works

The `Widget` interface now expects the `component` property to be a function that receives `CustomProps`. This allows each widget to have its own custom header while maintaining all the control functionality.

## Widget Interface

```typescript
export interface Widget {
  id: string;
  type: WidgetType;
  title: string;
  icon: React.ReactNode;
  component: (props: CustomProps) => React.ReactNode;
  defaultValue: {
    w: number;
    h: number;
    minW: number;
    minH: number;
    x: number;
    y: number;
  };
  isResizable?: boolean;
}

export interface CustomProps {
  widget: Widget;
  isMaximized: boolean;
  onMaximize: () => void;
  isEditMode: boolean;
}
```

## Custom Header Props

Your custom header function receives these props:

- `widget`: The complete widget object
- `isMaximized`: Boolean indicating if the widget is currently maximized
- `onMaximize`: Function to toggle maximize state
- `isEditMode`: Boolean indicating if the dashboard is in edit mode

## Example Usage

### Basic Widget with Custom Header

```typescript
// Custom Header Component
const MyCustomHeader: React.FC<CustomProps> = ({
  widget,
  isMaximized,
  onMaximize,
  isEditMode,
}) => {
  return (
    <div className="flex items-center justify-between px-4 py-2 border-b border-border/50">
      <div className="flex items-center gap-2">
        {isEditMode && (
          <div className="cursor-move h-7 w-7 flex items-center justify-center">
            <GripVertical className="w-3.5 h-3.5 text-muted-foreground" />
          </div>
        )}
        <div className="text-primary">{widget.icon}</div>
        <h3 className="text-sm font-medium">{widget.title}</h3>
      </div>

      <Button
        variant="ghost"
        size="iconSm"
        onClick={onMaximize}
        className="h-7 w-7"
      >
        {isMaximized ? (
          <Minimize2 className="w-3.5 h-3.5" />
        ) : (
          <Maximize2 className="w-3.5 h-3.5" />
        )}
      </Button>
    </div>
  );
};

// Widget Component
const MyWidget = memo((props: CustomProps) => {
  return (
    <div className="h-full w-full flex flex-col overflow-hidden bg-background/95 backdrop-blur-xl border-1 border-solid border-border shadow-sm hover:shadow-xl transition-all duration-300 rounded-md">
      {/* Custom Header */}
      <MyCustomHeader {...props} />

      {/* Widget Content */}
      <div className="flex-1 overflow-auto customScrollbar2">
        <MyProvider>
          <MyWidgetContent />
        </MyProvider>
      </div>
    </div>
  );
});

// Widget Definition
const widgets: Widget[] = [
  {
    id: "my-widget",
    type: "music",
    title: "My Custom Widget",
    icon: <Music className="w-4 h-4" />,
    component: MyWidget, // Pass the component function
    defaultValue: { w: 7, h: 3, minW: 7, minH: 3, x: 0, y: 0 },
  },
];
```

## Available Custom Headers

The following custom headers are already implemented and available:

### MusicCustomHeader

- Features: Play/pause controls, progress bar, "Now Playing" status
- Styling: Gradient background with primary colors

### PomodoroCustomHeader

- Features: Timer display, play/pause controls, session type indicator
- Styling: Color-coded based on work/break session

### ChatCustomHeader

- Features: Online status indicator, unread message count, last message timestamp
- Styling: Online status with colored indicators

## Key Features

1. **Maintains All Controls**: Maximize, minimize, and edit mode functionality is preserved
2. **Flexible Design**: You can create any custom header design you want
3. **Consistent Props**: All custom headers receive the same props for consistency
4. **Optional**: If no custom header is provided, the default header is used
5. **Edit Mode Support**: Custom headers automatically show drag handles in edit mode

## Best Practices

1. **Always include the maximize button** - Users expect this functionality
2. **Show the drag handle in edit mode** - Use the `isEditMode` prop to conditionally show the grip
3. **Maintain consistent spacing** - Use the same padding and margins as the default header
4. **Keep it functional** - Don't sacrifice functionality for aesthetics
5. **Use semantic colors** - Follow the design system for consistent theming

## Migration from Default Headers

If you want to migrate from the default header to a custom one:

1. Create your custom header component
2. Add the `customHeader` property to your widget definition
3. The system will automatically use your custom header instead of the default

The default header will still be used for any widgets that don't specify a `customHeader` property.
