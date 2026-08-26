import { useData } from "../context/DataContext.js";
import { AutonomousShell } from "./AutonomousShell.jsx";
// import { CoachShell } from "./CoachShell.jsx";
// import { AthleteShell } from "./AthleteShell.jsx";

export function RoleRouter({ isDark, toggleTheme, styles, onOpenPublicPlan }) {
  const { data } = useData();
  const role = data.profile?.role;

  // Uncomment when CoachShell / AthleteShell are ready:
  // if (role === "coach") return <CoachShell isDark={isDark} toggleTheme={toggleTheme} styles={styles} />;
  // if (role === "athlete") return <AthleteShell isDark={isDark} toggleTheme={toggleTheme} styles={styles} />;

  void role;
  return (
    <AutonomousShell
      isDark={isDark} toggleTheme={toggleTheme} styles={styles}
      onOpenPublicPlan={onOpenPublicPlan}
    />
  );
}
