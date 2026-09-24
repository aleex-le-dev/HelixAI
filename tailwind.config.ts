import type { Config } from "tailwindcss";
import plugin from "tailwindcss/plugin";

/** Couleur pilotee par token HSL avec support d'alpha (`bg-accent/15`, etc.). */
const hsl = (name: string) => `hsl(var(--${name}) / <alpha-value>)`;

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        border: hsl("border"),
        input: hsl("input"),
        ring: hsl("ring"),
        background: hsl("background"),
        foreground: hsl("foreground"),
        primary: {
          DEFAULT: hsl("primary"),
          foreground: hsl("primary-foreground"),
        },
        secondary: {
          DEFAULT: hsl("secondary"),
          foreground: hsl("secondary-foreground"),
        },
        muted: {
          DEFAULT: hsl("muted"),
          foreground: hsl("muted-foreground"),
        },
        accent: {
          DEFAULT: hsl("accent"),
          foreground: hsl("accent-foreground"),
        },
        info: {
          DEFAULT: hsl("info"),
          foreground: hsl("info-foreground"),
        },
        destructive: {
          DEFAULT: hsl("destructive"),
          foreground: hsl("destructive-foreground"),
        },
        success: {
          DEFAULT: hsl("success"),
          foreground: hsl("success-foreground"),
        },
        warning: {
          DEFAULT: hsl("warning"),
          foreground: hsl("warning-foreground"),
        },
        card: {
          DEFAULT: hsl("card"),
          foreground: hsl("card-foreground"),
        },
        popover: {
          DEFAULT: hsl("popover"),
          foreground: hsl("popover-foreground"),
        },
        /* Voile de modale : sombre dans les deux themes, contrairement aux neutres. */
        overlay: hsl("overlay"),
        sidebar: {
          DEFAULT: hsl("sidebar"),
          foreground: hsl("sidebar-foreground"),
          muted: hsl("sidebar-muted"),
          border: hsl("sidebar-border"),
          active: hsl("sidebar-active"),
        },
        neutral: {
          15: hsl("neutral-15"),
          30: hsl("neutral-30"),
          40: hsl("neutral-40"),
          50: hsl("neutral-50"),
          60: hsl("neutral-60"),
          70: hsl("neutral-70"),
          80: hsl("neutral-80"),
          90: hsl("neutral-90"),
        },
      },
      borderRadius: {
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
        xl: "var(--radius-xl)",
        "2xl": "var(--radius-2xl)",
        DEFAULT: "var(--radius)",
      },
      boxShadow: {
        sm: "var(--shadow-sm)",
        md: "var(--shadow-md)",
        lg: "var(--shadow-lg)",
        pop: "var(--shadow-pop)",
      },
      fontFamily: {
        sans: "var(--font-body)",
        display: "var(--font-display)",
      },
      fontSize: {
        xs: "var(--text-xs)",
        sm: "var(--text-sm)",
        base: "var(--text-base)",
        lg: "var(--text-lg)",
        xl: "var(--text-xl)",
        "2xl": "var(--text-2xl)",
        "3xl": "var(--text-3xl)",
        "4xl": "var(--text-4xl)",
        "5xl": "var(--text-5xl)",
      },
      spacing: {
        element: "var(--gap-element)",
        card: "var(--gap-card)",
        content: "var(--gap-content)",
      },
      transitionTimingFunction: {
        brand: "cubic-bezier(0.4, 0, 0.2, 1)",
      },
    },
  },
  plugins: [
    /*
     * Requêtes de conteneur : une mise en page qui dépend de la place réelle
     * du bloc (barre latérale ouverte ou non, navigation des paramètres), pas
     * de la largeur de la fenêtre. `cq` fait d'un bloc un conteneur ;
     * `cq-sm:`, `cq-md:`, `cq-lg:` s'appliquent quand le conteneur le plus
     * proche atteint 28, 36 ou 44 rem.
     */
    plugin(({ addUtilities, addVariant }) => {
      addUtilities({ ".cq": { "container-type": "inline-size" } });
      addVariant("cq-sm", "@container (min-width: 28rem)");
      addVariant("cq-md", "@container (min-width: 36rem)");
      addVariant("cq-lg", "@container (min-width: 44rem)");
    }),
  ],
} satisfies Config;
