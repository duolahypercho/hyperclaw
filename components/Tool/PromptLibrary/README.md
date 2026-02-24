# Prompt Library Tool

A comprehensive prompt management and optimization tool for Hypercho OS.

## Features

### Core Functionality

- **Prompt Management**: Create, edit, and organize prompts
- **Optimization**: AI-powered prompt optimization with multiple strategies
- **Playground**: Test and experiment with prompts
- **History**: Track prompt versions and changes
- **Variables**: Dynamic prompt templates with variable substitution

### Variables System

The Prompt Library now supports dynamic variables that allow you to create reusable prompt templates.

#### Variable Types

- **Text**: Free-form text input
- **Number**: Numeric values
- **Select**: Dropdown with predefined options
- **Boolean**: True/false toggle

#### Variable Features

- **Auto-detection**: Automatically detect variables from prompt templates using `{{variableName}}` syntax
- **Default Values**: Set default values for variables
- **Required Fields**: Mark variables as required
- **Descriptions**: Add helpful descriptions for each variable
- **Placeholders**: Custom placeholder text for inputs
- **Real-time Preview**: See how your prompt looks with current variable values

#### Usage Examples

1. **Create a Variable Template**:

   ```
   Write a blog post about {{topic}} with a {{tone}} tone.
   The post should be {{length}} words long.
   Target audience: {{audience}}.
   ```

2. **Auto-detect Variables**: Click the "Auto-detect" button to automatically create variables from your prompt template.

3. **Set Variable Values**: Use the Variable Values section to input values and see a live preview.

4. **Generate Sample Prompts**: Click "Sample Prompt" to generate a template with common variables.

#### Variable Syntax

- Use `{{variableName}}` in your prompts to create variable placeholders
- Variables are case-sensitive
- Spaces and special characters are supported in variable names

### Optimization Strategies

The tool includes several built-in optimization strategies:

- **Role Definition**: Add clear role and context
- **Structure Enhancement**: Improve prompt structure and clarity
- **Instruction Clarity**: Make instructions more specific and actionable
- **Custom Strategies**: Create your own optimization strategies

### Chat History

- Add conversation context to your prompts
- Support for both user and assistant messages
- Maximum of 20 messages per prompt
- Easy management with add/remove functionality

## Components

### PromptConfigDetail

The main configuration component that includes:

- Original prompt editing
- Optimization strategy selection
- Variables management
- Chat history management
- Optimized prompt display

### Key Features

- **Real-time Updates**: All changes are reflected immediately
- **Auto-save**: Changes are automatically saved
- **Validation**: Built-in validation for required fields
- **Responsive Design**: Works on all screen sizes
- **Dark Mode Support**: Full dark mode compatibility

## Usage

1. **Create a New Prompt**: Click "New Prompt" to start fresh
2. **Add Variables**: Use the Variables section to make your prompt dynamic
3. **Optimize**: Select an optimization strategy and click "Optimize Prompt"
4. **Test**: Use the playground to test your prompt with different variable values
5. **Save**: Your changes are automatically saved

## Technical Details

### State Management

- Uses React Context for global state
- Local state for UI interactions
- Optimized re-renders with useMemo and useCallback

### Performance

- Lazy loading of components
- Memoized expensive calculations
- Efficient variable substitution

### Accessibility

- Full keyboard navigation support
- Screen reader compatible
- ARIA labels and descriptions
- Focus management

## Future Enhancements

- Variable validation rules
- Conditional variables
- Variable templates
- Bulk variable operations
- Variable import/export
- Advanced variable types (date, file, etc.)

# Prompt Library - Lazy Loading Version History

## Overview

The Prompt Library now implements lazy loading for version history to improve performance and reduce initial data transfer. Instead of loading all version details upfront, the system now:

1. **Loads version summaries initially** - Contains metadata and preview text only
2. **Fetches full version details on demand** - Only when user expands a specific version
3. **Caches loaded versions** - Prevents redundant API calls for already loaded versions

## Architecture

### Types

```typescript
// Lightweight version summary (loaded initially)
interface PromptVersionSummary {
  id: string;
  version: number;
  createdAt: string;
  description: string;
  type: "original" | "optimized" | "manual";
  optimizationStrategy?: string;
  promptPreview?: string; // First 100 characters
  hasFullContent?: boolean;
}

// Full version details (loaded on demand)
interface PromptVersionDetails extends PromptVersionSummary {
  prompt: string; // Full prompt content
}
```

### API Endpoints

```typescript
// Get version summaries (lightweight)
GET / Tools / prompt / { promptId } / versions;

// Get full version details (on demand)
GET / Tools / prompt / { promptId } / versions / { versionId };
```

### Components

#### PromptVersionHistory

- **Props**: `promptId`, `versionSummaries`, `currentVersion`, callbacks
- **Behavior**:
  - Displays version summaries with preview text
  - Loads full details when user expands a version
  - Shows loading states during API calls
  - Caches loaded versions to prevent redundant requests

#### OptimizeProvider

- **State**: `versionSummaries`, `loadingVersionSummaries`
- **Methods**: `loadVersionSummaries()`, `convertVersionsToSummaries()`
- **Fallback**: Converts existing `PromptVersion[]` to summaries if API unavailable

## Usage

### Basic Implementation

```tsx
import { useOptimize } from "./provider/OptimizeProv";
import PromptVersionHistory from "./ui/components/PromptVersionHistory";

const MyComponent = () => {
  const { versionSummaries, loadingVersionSummaries, loadVersionSummaries } =
    useOptimize();

  return (
    <PromptVersionHistory
      promptId={prompt._id}
      versionSummaries={versionSummaries}
      currentVersion={prompt.currentVersion}
      onVersionSelect={(version) => {
        // Handle version selection
      }}
      onRestoreVersion={(version) => {
        // Handle version restoration
      }}
    />
  );
};
```

### Loading States

The component automatically handles loading states:

1. **Initial loading**: Shows skeleton placeholders while fetching summaries
2. **Version expansion**: Shows loading spinner while fetching full details
3. **Cached versions**: Instantly shows content for previously loaded versions

## Benefits

### Performance

- **Reduced initial load time** - Only metadata loaded upfront
- **Lower bandwidth usage** - Full content only when needed
- **Better scalability** - Handles large version histories efficiently

### User Experience

- **Faster UI rendering** - Immediate display of version list
- **Progressive disclosure** - Users see what they need when they need it
- **Smooth interactions** - Loading states provide clear feedback

### Backward Compatibility

- **Fallback support** - Works with existing `PromptVersion[]` arrays
- **Gradual migration** - Can be adopted incrementally
- **No breaking changes** - Existing code continues to work

## Migration Guide

### From PromptVersion[] to PromptVersionSummary[]

```typescript
// Old approach
const versions: PromptVersion[] = prompt.versions || [];

// New approach
const versionSummaries: PromptVersionSummary[] = useOptimize().versionSummaries;
```

### API Integration

1. **Implement summary endpoint**: Return lightweight version data
2. **Implement details endpoint**: Return full version content
3. **Update frontend**: Use new lazy loading components
4. **Test performance**: Verify improved load times

## Best Practices

1. **Cache management**: Clear cache when prompt changes
2. **Error handling**: Graceful fallback for API failures
3. **Loading states**: Always show appropriate loading indicators
4. **User feedback**: Toast notifications for errors
5. **Performance monitoring**: Track load times and user interactions

## Future Enhancements

- **Virtual scrolling** for very large version histories
- **Background prefetching** of likely-to-be-viewed versions
- **Offline support** with cached version details
- **Version comparison** with side-by-side diff view
- **Bulk operations** for multiple versions
