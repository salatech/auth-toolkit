declare module 'react-native' {
  import type { ComponentType, ReactNode, Ref } from 'react';

  export interface ViewProps {
    style?: object | object[];
    children?: ReactNode;
  }

  export interface TextProps {
    style?: object | object[];
    children?: ReactNode;
  }

  export interface ButtonProps {
    title: string;
    onPress: () => void;
    disabled?: boolean;
    color?: string;
  }

  export interface TextInputProps {
    value?: string;
    placeholder?: string;
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
  export const Text: ComponentType<TextProps>;
  export const Button: ComponentType<ButtonProps>;

  export const StyleSheet: {
    create<T extends Record<string, object>>(styles: T): T;
  };
}
