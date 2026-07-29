declare module 'react-native' {
  import type { ComponentType, Ref } from 'react';

  export interface ViewProps {
    style?: object | object[];
    children?: React.ReactNode;
  }

  export interface TextInputProps {
    value?: string;
    editable?: boolean;
    keyboardType?: string;
    textContentType?: string;
    autoComplete?: string;
    maxLength?: number;
    accessibilityLabel?: string;
    style?: object | object[];
    onChangeText?: (text: string) => void;
    onKeyPress?: (event: { nativeEvent: { key: string } }) => void;
  }

  export interface TextInputInstance {
    focus(): void;
  }

  export const TextInput: ComponentType<
    TextInputProps & { ref?: Ref<TextInputInstance> }
  >;
  export const View: ComponentType<ViewProps>;
}
