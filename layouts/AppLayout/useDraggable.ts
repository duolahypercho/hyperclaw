import {
  useEffect,
  useReducer,
  useCallback,
  RefObject,
  useRef,
  useState,
  useMemo,
} from "react";
import { useOS } from "../../OS/Provider/OSProv";
import { useDebouncedCallback } from "../../hooks/isDebounce";

export interface initialSizeType {
  min?: Size;
  max?: Size;
  default?: Size;
}

interface DraggableProps {
  elementRef: RefObject<HTMLDivElement>;
  id: string;
  initialSize?: initialSizeType;
  isExpandable?: boolean;
  expandActive?: boolean;
  expandedHeight?: number;
}

export enum ResizeDirection {
  Top = "n-resize",
  TopRight = "ne-resize",
  Right = "e-resize",
  BottomRight = "se-resize",
  Bottom = "s-resize",
  BottomLeft = "sw-resize",
  Left = "w-resize",
  TopLeft = "nw-resize",
}

export interface Size {
  width: number;
  height: number;
}

export interface Position {
  x: number;
  y: number;
}

interface Bounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

interface State {
  position: Position;
  isDragging: boolean;
  isResizing: boolean;
  dragStart: Position;
  resizeDirection: ResizeDirection | null;
  bounds: Bounds;
  size: Size;
  minSize: Size;
  maxSize: Size;
}

type Action =
  | { type: "MOUSE_DOWN"; clientX: number; clientY: number }
  | { type: "MOUSE_MOVE"; clientX: number; clientY: number }
  | { type: "MOUSE_UP" }
  | {
      type: "UPDATE_BOUNDS";
      width: number;
      height: number;
      isExpandable?: boolean;
      expandActive?: boolean;
      expandedHeight?: number;
    }
  | { type: "CLAMP_POSITION" }
  | {
      type: "RESIZE_START";
      clientX: number;
      clientY: number;
      direction: ResizeDirection;
    }
  | { type: "RESIZE_MOVE"; clientX: number; clientY: number }
  | { type: "RESIZE_END" };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "MOUSE_DOWN": {
      const { clientX, clientY } = action;
      return {
        ...state,
        isDragging: true,
        dragStart: {
          x: clientX - state.position.x,
          y: clientY - state.position.y,
        },
      };
    }
    case "MOUSE_MOVE": {
      if (!state.isDragging) return state;
      const { clientX, clientY } = action;

      // Optimized position calculation
      const newX = clientX - state.dragStart.x;
      const newY = clientY - state.dragStart.y;

      // Fast bounds checking without function call overhead
      const clampedX = Math.min(
        Math.max(newX, state.bounds.minX),
        state.bounds.maxX
      );
      const clampedY = Math.min(
        Math.max(newY, state.bounds.minY),
        state.bounds.maxY
      );

      // Only update if position actually changed
      if (clampedX === state.position.x && clampedY === state.position.y) {
        return state;
      }

      // Optimize object creation - only create new position object if needed
      const newPosition = { x: clampedX, y: clampedY };
      return {
        ...state,
        position: newPosition,
      };
    }
    case "MOUSE_UP":
      return { ...state, isDragging: false };
    case "UPDATE_BOUNDS": {
      const { width, height, isExpandable, expandActive, expandedHeight } =
        action;
      // Only use expanded height logic for expandable containers
      const effectiveHeight =
        isExpandable && expandActive && expandedHeight
          ? expandedHeight
          : height;

      const updatedBounds = {
        minX: 0,
        maxX: window.innerWidth - width,
        minY: 0,
        maxY: window.innerHeight - effectiveHeight,
      };

      // Only update if bounds actually changed
      if (
        updatedBounds.minX === state.bounds.minX &&
        updatedBounds.maxX === state.bounds.maxX &&
        updatedBounds.minY === state.bounds.minY &&
        updatedBounds.maxY === state.bounds.maxY
      ) {
        return state;
      }

      return { ...state, bounds: updatedBounds };
    }
    case "CLAMP_POSITION": {
      // Fast bounds checking without function call overhead
      const clampedX = Math.min(
        Math.max(state.position.x, state.bounds.minX),
        state.bounds.maxX
      );
      const clampedY = Math.min(
        Math.max(state.position.y, state.bounds.minY),
        state.bounds.maxY
      );

      // Only update if position actually changed
      if (clampedX === state.position.x && clampedY === state.position.y) {
        return state;
      }

      return {
        ...state,
        position: { x: clampedX, y: clampedY },
      };
    }
    case "RESIZE_START": {
      return {
        ...state,
        isResizing: true,
        resizeDirection: action.direction,
        dragStart: {
          x: action.clientX,
          y: action.clientY,
        },
      };
    }

    case "RESIZE_MOVE": {
      if (!state.isResizing) return state;

      const deltaX = action.clientX - state.dragStart.x;
      const deltaY = action.clientY - state.dragStart.y;

      let newWidth = state.size.width;
      let newHeight = state.size.height;
      let newX = state.position.x;
      let newY = state.position.y;

      switch (state.resizeDirection) {
        case ResizeDirection.Top:
          newHeight = Math.max(
            state.minSize.height,
            state.size.height - deltaY
          );
          // Only update Y if we're not at min/max height
          if (
            newHeight > state.minSize.height &&
            newHeight < state.maxSize.height
          ) {
            newY = state.position.y + deltaY;
          }
          break;

        case ResizeDirection.TopRight:
          newWidth = Math.max(state.minSize.width, state.size.width + deltaX);
          newHeight = Math.max(
            state.minSize.height,
            state.size.height - deltaY
          );
          // Only update Y if we're not at min/max height
          if (
            newHeight > state.minSize.height &&
            newHeight < state.maxSize.height
          ) {
            newY = state.position.y + deltaY;
          }
          break;

        case ResizeDirection.Right:
          newWidth = Math.max(state.minSize.width, state.size.width + deltaX);
          break;

        case ResizeDirection.BottomRight:
          newWidth = Math.max(state.minSize.width, state.size.width + deltaX);
          newHeight = Math.max(
            state.minSize.height,
            state.size.height + deltaY
          );
          break;

        case ResizeDirection.Bottom:
          newHeight = Math.max(
            state.minSize.height,
            state.size.height + deltaY
          );
          break;

        case ResizeDirection.BottomLeft:
          newWidth = Math.max(state.minSize.width, state.size.width - deltaX);
          newHeight = Math.max(
            state.minSize.height,
            state.size.height + deltaY
          );
          // Only update X if we're not at min/max width
          if (
            newWidth > state.minSize.width &&
            newWidth < state.maxSize.width
          ) {
            newX = state.position.x + deltaX;
          }
          break;

        case ResizeDirection.Left:
          newWidth = Math.max(state.minSize.width, state.size.width - deltaX);
          // Only update X if we're not at min/max width
          if (
            newWidth > state.minSize.width &&
            newWidth < state.maxSize.width
          ) {
            newX = state.position.x + deltaX;
          }
          break;

        case ResizeDirection.TopLeft:
          newWidth = Math.max(state.minSize.width, state.size.width - deltaX);
          newHeight = Math.max(
            state.minSize.height,
            state.size.height - deltaY
          );
          // Only update X if we're not at min/max width
          if (
            newWidth > state.minSize.width &&
            newWidth < state.maxSize.width
          ) {
            newX = state.position.x + deltaX;
          }
          // Only update Y if we're not at min/max height
          if (
            newHeight > state.minSize.height &&
            newHeight < state.maxSize.height
          ) {
            newY = state.position.y + deltaY;
          }
          break;
      }

      // Clamp the size to min/max constraints
      const clampedWidth = Math.min(
        state.maxSize.width,
        Math.max(state.minSize.width, newWidth)
      );
      const clampedHeight = Math.min(
        state.maxSize.height,
        Math.max(state.minSize.height, newHeight)
      );

      // If the size hasn't effectively changed after clamping, do nothing
      const widthChanged = clampedWidth !== state.size.width;
      const heightChanged = clampedHeight !== state.size.height;
      if (!widthChanged && !heightChanged) {
        return state;
      }

      return {
        ...state,
        size: { width: clampedWidth, height: clampedHeight },
        position: { x: newX, y: newY },
        dragStart: {
          x: action.clientX,
          y: action.clientY,
        },
      };
    }

    case "RESIZE_END": {
      return { ...state, isResizing: false };
    }
    default:
      return state;
  }
}

export const useDraggable = ({
  elementRef,
  id,
  initialSize,
  isExpandable = false,
  expandActive = false,
  expandedHeight = 600,
}: DraggableProps) => {
  const { getAppSettings, updateAppSettings } = useOS();
  const isInitializedRef = useRef(false);

  // Create debounced update function for app settings
  const debouncedUpdateSettings = useDebouncedCallback(
    (newPosition: Position, newSize: Size) => {
      if (isInitializedRef.current) {
        updateAppSettings(id, {
          position: newPosition,
          size: newSize,
        });
      }
    },
    300 // 300ms delay for smooth performance
  );

  // Memoize initial size first
  const initialSizeValue = useMemo(() => {
    return (
      getAppSettings(id).size ||
      initialSize?.default || { width: 400, height: 150 }
    );
  }, [id, initialSize?.default]);

  // Get initial position and size from OS settings with consistent defaults
  const getDefaultPosition = useCallback(() => {
    if (typeof window === "undefined") {
      return { x: 200, y: 100 }; // SSR fallback
    }
    return {
      x: (window.innerWidth - initialSizeValue.width) / 2 + 50,
      y: (window.innerHeight - initialSizeValue.height) / 2 + 50,
    };
  }, [initialSizeValue.width, initialSizeValue.height]);

  // Memoize initial position
  const initialPosition = useMemo(() => {
    return getAppSettings(id).position || getDefaultPosition();
  }, [getDefaultPosition]);

  // Use local state for real-time updates (fast)
  const [position, setPosition] = useState(initialPosition);
  const [size, setSize] = useState(initialSizeValue);

  const initialState: State = useMemo(() => {
    // SSR-safe window dimensions
    const windowWidth =
      typeof window !== "undefined" ? window.innerWidth : 1920;
    const windowHeight =
      typeof window !== "undefined" ? window.innerHeight : 1080;

    return {
      position: initialPosition, // Use the calculated initial position
      isDragging: false,
      isResizing: false,
      dragStart: { x: 0, y: 0 },
      resizeDirection: null,
      bounds: {
        minX: 0,
        maxX: windowWidth - initialSizeValue.width,
        minY: 0,
        maxY: windowHeight - initialSizeValue.height,
      },
      size: initialSizeValue, // Use the calculated initial size
      minSize: initialSize?.min || { width: 400, height: 150 },
      maxSize: initialSize?.max || {
        width: windowWidth,
        height: windowHeight,
      },
    };
  }, [initialPosition, initialSizeValue, initialSize?.min, initialSize?.max]);

  const [state, dispatch] = useReducer(reducer, initialState);

  // Mark as initialized after first render
  useEffect(() => {
    isInitializedRef.current = true;
  }, []);

  // Sync local state with reducer state and trigger debounced updates
  useEffect(() => {
    if (JSON.stringify(position) !== JSON.stringify(state.position)) {
      setPosition(state.position);
      debouncedUpdateSettings(state.position, state.size);
    }
    if (JSON.stringify(size) !== JSON.stringify(state.size)) {
      setSize(state.size);
      debouncedUpdateSettings(state.position, state.size);
    }
  }, [state.position, state.size, position, size, debouncedUpdateSettings]);

  // Add this ref to track dragging state without causing re-renders
  const isDraggingRef = useRef(false);
  const isResizingRef = useRef(false);

  // Update refs when state changes
  useEffect(() => {
    isDraggingRef.current = state.isDragging;
    isResizingRef.current = state.isResizing;
  }, [state.isDragging, state.isResizing]);

  // Disable global text selection while dragging/resizing
  useEffect(() => {
    if (state.isDragging || state.isResizing) {
      document.body.classList.add("nonselect");
    } else {
      document.body.classList.remove("nonselect");
    }
  }, [state.isDragging, state.isResizing]);

  // Optimized bounds calculation - only when needed
  useEffect(() => {
    const handleResize = () => {
      if (elementRef.current) {
        const width = elementRef.current.offsetWidth || 400;
        const height = elementRef.current.offsetHeight || 150;

        // Remove requestAnimationFrame for immediate bounds update
        dispatch({
          type: "UPDATE_BOUNDS",
          width,
          height,
          isExpandable,
          expandActive,
          expandedHeight,
        });
        dispatch({ type: "CLAMP_POSITION" });
      }
    };

    // Initial bounds setup - immediate execution for better responsiveness
    handleResize();

    // Add window resize listener
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [
    elementRef,
    state.size.width,
    state.size.height,
    isExpandable,
    expandActive,
    expandedHeight,
  ]);

  // Optimized mouse event handling
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDraggingRef.current) {
        e.preventDefault(); // Prevent text selection while dragging
        dispatch({
          type: "MOUSE_MOVE",
          clientX: e.clientX,
          clientY: e.clientY,
        });
      }
    };

    const handleMouseUp = () => {
      dispatch({ type: "MOUSE_UP" });
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  const handleResizeStart = useCallback(
    (e: React.MouseEvent, direction: ResizeDirection) => {
      e.stopPropagation(); // Prevent dragging when resizing
      dispatch({
        type: "RESIZE_START",
        clientX: e.clientX,
        clientY: e.clientY,
        direction,
      });
    },
    [dispatch]
  );

  // Optimized resize event handling
  useEffect(() => {
    const handleResizeMove = (e: MouseEvent) => {
      if (isResizingRef.current) {
        e.preventDefault(); // Prevent text selection while resizing
        dispatch({
          type: "RESIZE_MOVE",
          clientX: e.clientX,
          clientY: e.clientY,
        });
      }
    };

    const handleResizeEnd = () => {
      dispatch({ type: "RESIZE_END" });
    };

    document.addEventListener("mousemove", handleResizeMove);
    document.addEventListener("mouseup", handleResizeEnd);

    return () => {
      document.removeEventListener("mousemove", handleResizeMove);
      document.removeEventListener("mouseup", handleResizeEnd);
    };
  }, []);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      dispatch({ type: "MOUSE_DOWN", clientX: e.clientX, clientY: e.clientY });
    },
    [dispatch]
  );

  return {
    position: state.position,
    size: state.size,
    handleMouseDown,
    handleResizeStart,
  };
};
