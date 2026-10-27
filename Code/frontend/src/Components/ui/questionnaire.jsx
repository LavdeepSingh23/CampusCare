import * as React from "react";
import { cn } from "../../lib/utils";
import { Check as CheckIcon } from "lucide-react";

/**
 * Button variants utility adhering to CampusCare light theme token conventions.
 */
export function buttonVariants({
  size = "default",
  variant = "default",
  className = "",
} = {}) {
  const base =
    "inline-flex items-center justify-center font-semibold rounded-xl transition-all cursor-pointer select-none disabled:opacity-40 disabled:pointer-events-none active:scale-[0.98]";

  const variants = {
    default:
      "bg-teal-700 text-white hover:bg-teal-800 shadow-sm border border-teal-800/40",
    destructive:
      "bg-rose-600 text-white hover:bg-rose-700 shadow-sm border border-rose-700",
    outline:
      "border border-slate-200 bg-white text-slate-800 hover:bg-slate-50 shadow-2xs",
    secondary:
      "bg-slate-100 text-slate-800 hover:bg-slate-200/80 border border-slate-200/60",
    ghost:
      "text-slate-700 hover:bg-slate-100",
    link: "text-teal-700 underline-offset-4 hover:underline",
  };

  const sizes = {
    default: "h-10 px-4 py-2 text-sm",
    sm: "h-8 px-3 text-xs",
    lg: "h-11 px-5 text-sm",
    icon: "h-10 w-10",
  };

  return cn(base, variants[variant] || variants.default, sizes[size] || sizes.default, className);
}

/**
 * Primitive implementation providing standard questionnaire slots and states.
 */
const QuestionnairePrimitive = {
  Root: React.forwardRef(function QuestionnaireRoot(
    { className, as: Component = "div", ...props },
    ref
  ) {
    return <Component ref={ref} className={className} {...props} />;
  }),

  Progress: React.forwardRef(function QuestionnaireProgress(
    { className, as: Component = "div", ...props },
    ref
  ) {
    return <Component ref={ref} className={className} {...props} />;
  }),

  Item: React.forwardRef(function QuestionnaireItem(
    { className, as: Component = "div", multiple, ...props },
    ref
  ) {
    return <Component ref={ref} data-multiple={multiple ? "" : undefined} className={className} {...props} />;
  }),

  Title: React.forwardRef(function QuestionnaireTitle(
    { className, as: Component = "h3", ...props },
    ref
  ) {
    return <Component ref={ref} className={className} {...props} />;
  }),

  Description: React.forwardRef(function QuestionnaireDescription(
    { className, as: Component = "p", ...props },
    ref
  ) {
    return <Component ref={ref} className={className} {...props} />;
  }),

  Choices: React.forwardRef(function QuestionnaireChoices(
    { className, as: Component = "div", ...props },
    ref
  ) {
    return <Component ref={ref} className={className} {...props} />;
  }),

  Choice: React.forwardRef(function QuestionnaireChoice(
    { className, as: Component = "label", checked, disabled, shortcut, ...props },
    ref
  ) {
    return (
      <Component
        ref={ref}
        data-checked={checked ? "" : undefined}
        data-disabled={disabled ? "" : undefined}
        data-shortcut={shortcut ? "" : undefined}
        className={className}
        {...props}
      />
    );
  }),

  ChoiceInput: React.forwardRef(function QuestionnaireChoiceInput(
    { className, type = "checkbox", ...props },
    ref
  ) {
    return <input ref={ref} type={type} className={className} {...props} />;
  }),

  ChoiceLabel: React.forwardRef(function QuestionnaireChoiceLabel(
    { className, as: Component = "span", ...props },
    ref
  ) {
    return <Component ref={ref} className={className} {...props} />;
  }),

  ChoiceShortcut: React.forwardRef(function QuestionnaireChoiceShortcut(
    { className, children, ...props },
    ref
  ) {
    return (
      <span className={className} {...props}>
        {children}
      </span>
    );
  }),

  Input: React.forwardRef(function QuestionnaireInput(
    { className, ...props },
    ref
  ) {
    return <input ref={ref} className={className} {...props} />;
  }),

  Error: React.forwardRef(function QuestionnaireError(
    { className, as: Component = "div", ...props },
    ref
  ) {
    return <Component ref={ref} className={className} {...props} />;
  }),

  Previous: React.forwardRef(function QuestionnairePrevious(
    { className, as: Component = "button", ...props },
    ref
  ) {
    return <Component ref={ref} type="button" className={className} {...props} />;
  }),

  Skip: React.forwardRef(function QuestionnaireSkip(
    { className, as: Component = "button", ...props },
    ref
  ) {
    return <Component ref={ref} type="button" className={className} {...props} />;
  }),

  Next: React.forwardRef(function QuestionnaireNext(
    { className, as: Component = "button", ...props },
    ref
  ) {
    return <Component ref={ref} type="button" className={className} {...props} />;
  }),

  Submit: React.forwardRef(function QuestionnaireSubmit(
    { className, as: Component = "button", ...props },
    ref
  ) {
    return <Component ref={ref} type="button" className={className} {...props} />;
  }),
};

/* ── Compound Questionnaire Components (Pure Light Theme) ── */

export function Questionnaire({ className, ...props }) {
  return (
    <QuestionnairePrimitive.Root
      data-slot="questionnaire"
      className={cn("flex w-full min-w-0 flex-col gap-4", className)}
      {...props}
    />
  );
}

export function QuestionnaireProgress({ className, ...props }) {
  return (
    <QuestionnairePrimitive.Progress
      data-slot="questionnaire-progress"
      className={cn(
        "min-h-[1lh] w-fit min-w-[14ch] text-xs font-semibold text-slate-600 tabular-nums uppercase tracking-wider",
        className
      )}
      {...props}
    />
  );
}

export function QuestionnaireItem({ className, multiple, ...props }) {
  return (
    <QuestionnairePrimitive.Item
      data-slot="questionnaire-item"
      multiple={multiple}
      className={cn(
        "flex min-w-0 flex-col gap-4 border-0 p-0 outline-none animate-fadeIn",
        className
      )}
      {...props}
    />
  );
}

export function QuestionnaireTitle({ className, ...props }) {
  return (
    <QuestionnairePrimitive.Title
      data-slot="questionnaire-title"
      className={cn(
        "text-lg sm:text-xl font-bold tracking-tight text-slate-900 leading-snug [&:not(:has(~[data-slot=questionnaire-description]))]:mb-4",
        className
      )}
      {...props}
    />
  );
}

export function QuestionnaireDescription({ className, ...props }) {
  return (
    <QuestionnairePrimitive.Description
      data-slot="questionnaire-description"
      className={cn("text-xs sm:text-sm text-slate-600 leading-relaxed", className)}
      {...props}
    />
  );
}

export function QuestionnaireChoices({ className, ...props }) {
  return (
    <QuestionnairePrimitive.Choices
      data-slot="questionnaire-choices"
      className={cn(
        "group/questionnaire-choices grid min-w-0 gap-2.5",
        className
      )}
      {...props}
    />
  );
}

export function QuestionnaireChoice({
  children,
  className,
  checked,
  disabled,
  shortcut,
  onChange,
  onClick,
  ...props
}) {
  return (
    <QuestionnairePrimitive.Choice
      data-slot="questionnaire-choice"
      checked={checked}
      disabled={disabled}
      shortcut={shortcut}
      onClick={disabled ? undefined : onClick}
      className={cn(
        "group/questionnaire-choice relative flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-start text-sm transition-all outline-none select-none hover:border-teal-500 hover:bg-teal-50/40 data-checked:border-teal-700 data-checked:bg-teal-50/70 shadow-xs",
        disabled && "pointer-events-none cursor-not-allowed opacity-50",
        className
      )}
      {...props}
    >
      <QuestionnairePrimitive.ChoiceInput
        data-slot="questionnaire-choice-input"
        checked={checked}
        disabled={disabled}
        onChange={onChange || (() => {})}
        className="absolute inset-0 z-10 size-full cursor-pointer opacity-0"
      />
      <span
        aria-hidden="true"
        data-slot="questionnaire-choice-indicator"
        className={cn(
          "questionnaire-choice-indicator pointer-events-none relative flex size-4 shrink-0 items-center justify-center border border-slate-300 transition-colors rounded-full",
          checked && "border-teal-700 bg-teal-700"
        )}
      >
        <span
          data-slot="questionnaire-choice-indicator-dot"
          className={cn(
            "questionnaire-choice-indicator-dot size-1.5 rounded-full bg-white transition-opacity",
            checked ? "opacity-100" : "opacity-0"
          )}
        />
        <CheckIcon
          data-slot="questionnaire-choice-indicator-check"
          className={cn(
            "questionnaire-choice-indicator-check size-3 text-white transition-opacity",
            checked ? "opacity-100" : "opacity-0"
          )}
        />
      </span>
      <QuestionnairePrimitive.ChoiceLabel
        data-slot="questionnaire-choice-label"
        className="flex min-w-0 flex-1 flex-col gap-0.5 leading-snug text-slate-800"
      >
        {children}
      </QuestionnairePrimitive.ChoiceLabel>
      {shortcut && (
        <QuestionnairePrimitive.ChoiceShortcut
          data-slot="questionnaire-choice-shortcut"
          className="pointer-events-none ms-auto hidden sm:inline-flex h-5 min-w-5 px-1.5 items-center justify-center rounded-md border border-slate-200 bg-slate-100 font-mono text-[10px] font-bold text-slate-600 shadow-2xs"
        >
          {shortcut}
        </QuestionnairePrimitive.ChoiceShortcut>
      )}
    </QuestionnairePrimitive.Choice>
  );
}

export function QuestionnaireChoiceDescription({ className, ...props }) {
  return (
    <span
      data-slot="questionnaire-choice-description"
      className={cn("text-xs text-slate-500 mt-0.5", className)}
      {...props}
    />
  );
}

export function QuestionnaireInput({ className, ...props }) {
  return (
    <div
      data-slot="questionnaire-input-wrapper"
      className="group/questionnaire-input relative w-full min-w-0"
    >
      <QuestionnairePrimitive.Input
        data-slot="questionnaire-input"
        className={cn(
          "h-11 w-full min-w-0 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition-all focus:border-teal-600 focus:ring-2 focus:ring-teal-600/20 disabled:cursor-not-allowed disabled:opacity-50 shadow-xs",
          className
        )}
        {...props}
      />
    </div>
  );
}

export function QuestionnaireError({ className, ...props }) {
  return (
    <QuestionnairePrimitive.Error
      data-slot="questionnaire-error"
      className={cn("mt-2 text-xs font-semibold text-rose-600 flex items-center gap-1.5", className)}
      {...props}
    />
  );
}

export function QuestionnaireActions({ className, ...props }) {
  return (
    <div
      data-slot="questionnaire-actions"
      className={cn(
        "flex min-h-12 w-full items-center justify-between gap-3 pt-4 border-t border-slate-100",
        className
      )}
      {...props}
    />
  );
}

export function QuestionnairePrevious({
  children,
  className,
  size = "default",
  variant = "outline",
  ...props
}) {
  return (
    <QuestionnairePrimitive.Previous
      data-slot="questionnaire-previous"
      data-size={size}
      data-variant={variant}
      className={cn(buttonVariants({ size, variant }), className)}
      {...props}
    >
      {children ?? "Previous"}
    </QuestionnairePrimitive.Previous>
  );
}

export function QuestionnaireSkip({
  children,
  className,
  size = "default",
  variant = "ghost",
  ...props
}) {
  return (
    <QuestionnairePrimitive.Skip
      data-slot="questionnaire-skip"
      data-size={size}
      data-variant={variant}
      className={cn(buttonVariants({ size, variant }), className)}
      {...props}
    >
      {children ?? "Skip"}
    </QuestionnairePrimitive.Skip>
  );
}

export function QuestionnaireNext({
  children,
  className,
  size = "default",
  variant = "default",
  ...props
}) {
  return (
    <QuestionnairePrimitive.Next
      data-slot="questionnaire-next"
      data-size={size}
      data-variant={variant}
      className={cn(buttonVariants({ size, variant }), "ms-auto", className)}
      {...props}
    >
      {children ?? "Next"}
    </QuestionnairePrimitive.Next>
  );
}

export function QuestionnaireSubmit({
  children,
  className,
  size = "default",
  variant = "default",
  ...props
}) {
  return (
    <QuestionnairePrimitive.Submit
      data-slot="questionnaire-submit"
      data-size={size}
      data-variant={variant}
      className={cn(buttonVariants({ size, variant }), "ms-auto", className)}
      {...props}
    >
      {children ?? "Submit"}
    </QuestionnairePrimitive.Submit>
  );
}

export default Questionnaire;
