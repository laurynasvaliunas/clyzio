import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Animated,
  TouchableOpacity,
  Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import {
  TreeDeciduous,
  Award,
  TrendingUp,
  Users,
  Crown,
  Star,
  Footprints,
  Car,
  Leaf,
  Trophy,
  Lock,
  Zap,
  Target,
  X,
  Building2,
  User,
  BarChart3,
  Bus,
  Bike,
} from "lucide-react-native";
import { supabase } from "../../lib/supabase";
import CostSavingsCard from "../../components/CostSavingsCard";

const COLORS = {
  primary: "#26C6DA",
  primaryDark: "#00ACC1",
  accent: "#FDD835",
  accentDark: "#F9A825",
  dark: "#006064",
  light: "#E0F7FA",
  background: "#F5FAFA",
  white: "#FFFFFF",
  gray: "#90A4AE",
  green: "#4CAF50",
  black: "#000000",
  blackOverlay: "rgba(0, 0, 0, 0.5)",
  whiteTransparent10: "rgba(255, 255, 255, 0.1)",
  whiteTransparent20: "rgba(255, 255, 255, 0.2)",
  whiteTransparent30: "rgba(255, 255, 255, 0.3)",
};

// Level thresholds matching database
const LEVEL_THRESHOLDS = [
  { level: 1, min: 0, max: 100 },
  { level: 2, min: 100, max: 300 },
  { level: 3, min: 300, max: 600 },
  { level: 4, min: 600, max: 1000 },
  { level: 5, min: 1000, max: 1500 },
  { level: 6, min: 1500, max: 2100 },
  { level: 7, min: 2100, max: 2800 },
  { level: 8, min: 2800, max: 3600 },
  { level: 9, min: 3600, max: 4500 },
  { level: 10, min: 4500, max: 9999 },
];

const LEVEL_TITLES = [
  "Eco Beginner",
  "Green Starter",
  "Earth Ally",
  "Eco Warrior",
  "Planet Protector",
  "Green Champion",
  "Eco Master",
  "Climate Hero",
  "Earth Guardian",
  "Eco Legend",
];

// Badge definitions
const BADGES = [
  { id: "first_trip", name: "First Steps", desc: "Complete your first trip", icon: Star, color: "#FDD835" },
  { id: "first_carpool", name: "Carpool King", desc: "Share your first ride", icon: Car, color: COLORS.primary },
  { id: "walker_5", name: "Walking Warrior", desc: "Walk 5 trips", icon: Footprints, color: "#4CAF50" },
  { id: "trips_10", name: "Road Regular", desc: "Complete 10 trips", icon: Zap, color: "#FF9800" },
  { id: "co2_50", name: "CO2 Crusher", desc: "Save 50kg CO2", icon: Leaf, color: "#8BC34A" },
  { id: "co2_100", name: "Planet Protector", desc: "Save 100kg CO2", icon: TreeDeciduous, color: "#009688" },
];

const CO2_PER_TREE = 20;

/**
 * Get level information based on XP points
 * @param xp Current XP points
 * @returns Level info including progress and title
 */
function getLevelInfo(xp: number) {
  const levelData = LEVEL_THRESHOLDS.find(l => xp >= l.min && xp < l.max) || LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1];
  const progress = (xp - levelData.min) / (levelData.max - levelData.min);
  const xpToNext = levelData.max - xp;
  return { 
    level: levelData.level, 
    progress, 
    xpToNext, 
    min: levelData.min, 
    max: levelData.max, 
    title: LEVEL_TITLES[levelData.level - 1] 
  };
}

/**
 * Get icon component for transport mode
 */
function getTransportIcon(modeIcon: string) {
  switch (modeIcon) {
    case "walking": return Footprints;
    case "bike": return Bike;
    case "ebike": return Zap;
    case "public": return Bus;
    case "my_car": return Car;
    default: return Car;
  }
}

interface UserStats {
  total_co2_saved: number;
  total_trips: number;
  this_week_co2: number;
  last_week_co2: number;
}

interface TopMode {
  mode_label: string;
  mode_icon: string;
  count: number;
  percentage: number;
}

interface LeaderboardUser {
  id: string;
  name: string;
  department: string;
  total_saved: number;
  is_current_user: boolean;
}

interface DeptLeaderboardUser {
  user_id: string;
  user_name: string;
  total_co2_saved: number;
  total_trips: number;
}

interface CompanyBreakdown {
  department_id: string;
  department_name: string;
  total_co2_saved: number;
  employee_count: number;
}

interface CompanyTotals {
  company_name: string;
  total_co2_saved: number;
  total_trips: number;
  employee_count: number;
}

type StatsView = "personal" | "department" | "company";

/**
 * BadgeItem - Displays a single badge (locked or unlocked)
 */
interface BadgeItemProps {
  badge: typeof BADGES[0];
  isUnlocked: boolean;
  onPress: () => void;
}

function BadgeItem({ badge, isUnlocked, onPress }: BadgeItemProps) {
  const IconComponent = badge.icon;
  
  return (
    <TouchableOpacity
      style={[styles.badgeItem, isUnlocked && styles.badgeItemUnlocked]}
      onPress={() => isUnlocked && onPress()}
      activeOpacity={isUnlocked ? 0.7 : 1}
    >
      <View style={[styles.badgeCircle, isUnlocked && { backgroundColor: badge.color + "20" }]}>
        {isUnlocked ? (
          <IconComponent size={24} color={badge.color} />
        ) : (
          <Lock size={20} color={COLORS.gray} />
        )}
      </View>
      <Text style={[styles.badgeName, !isUnlocked && styles.badgeNameLocked]} numberOfLines={1}>
        {badge.name}
      </Text>
    </TouchableOpacity>
  );
}

/**
 * LeaderboardRow - Displays a single leaderboard entry
 */
interface LeaderboardRowProps {
  user: LeaderboardUser | DeptLeaderboardUser;
  index: number;
  isCurrentUser?: boolean;
  showDepartment?: boolean;
}

function LeaderboardRow({ user, index, isCurrentUser = false, showDepartment = true }: LeaderboardRowProps) {
  const isLeader = index === 0;
  const userName = 'is_current_user' in user && user.is_current_user ? "You" : ('name' in user ? user.name : 'user_name' in user ? user.user_name : '');
  const department = 'department' in user ? user.department : ('total_trips' in user ? `${user.total_trips} trips` : '');
  const totalSaved = 'total_saved' in user ? user.total_saved : user.total_co2_saved;
  
  return (
    <View style={[styles.leaderboardRow, isCurrentUser && styles.leaderboardRowHighlight]}>
      <View style={styles.leaderboardRank}>
        {isLeader ? <Crown size={20} color={COLORS.accent} /> : <Text style={styles.rankNumber}>{index + 1}</Text>}
      </View>
      <View style={styles.leaderboardInfo}>
        <Text style={[styles.leaderboardName, isCurrentUser && styles.leaderboardNameYou]}>
          {userName}
        </Text>
        {showDepartment && department && (
          <Text style={styles.leaderboardDept}>{department}</Text>
        )}
      </View>
      <View style={styles.leaderboardScore}>
        <Text style={[styles.leaderboardValue, isLeader && { color: COLORS.accent }]}>
          {totalSaved.toFixed(1)}
        </Text>
        <Text style={styles.leaderboardUnit}>kg</Text>
      </View>
    </View>
  );
}

/**
 * TopModeItem - Displays a single top commuting mode
 */
interface TopModeItemProps {
  mode: TopMode;
}

function TopModeItem({ mode }: TopModeItemProps) {
  const IconComponent = getTransportIcon(mode.mode_icon);
  
  return (
    <View style={styles.topModeItem}>
      <View style={styles.topModeIconBox}>
        <IconComponent size={28} color={COLORS.primary} />
      </View>
      <Text style={styles.topModeLabel}>{mode.mode_label}</Text>
      <Text style={styles.topModeCount}>{mode.count} trips</Text>
      <Text style={styles.topModePercentage}>{mode.percentage.toFixed(0)}%</Text>
    </View>
  );
}

/**
 * DepartmentBreakdownItem - Displays a single department in company breakdown
 */
interface DepartmentBreakdownItemProps {
  dept: CompanyBreakdown;
  maxCo2: number;
  barColor: string;
}

function DepartmentBreakdownItem({ dept, maxCo2, barColor }: DepartmentBreakdownItemProps) {
  const barWidth = (dept.total_co2_saved / maxCo2) * 100;
  
  return (
    <View style={styles.breakdownItem}>
      <View style={styles.breakdownHeader}>
        <Text style={styles.breakdownDept}>{dept.department_name}</Text>
        <Text style={styles.breakdownValue}>{dept.total_co2_saved.toFixed(1)} kg</Text>
      </View>
      <View style={styles.breakdownBarBg}>
        <View style={[styles.breakdownBarFill, { width: `${barWidth}%`, backgroundColor: barColor }]} />
      </View>
      <Text style={styles.breakdownEmployees}>{dept.employee_count} employees</Text>
    </View>
  );
}

/**
 * StatsScreen - Main impact statistics screen
 * Displays personal, department, and company-wide statistics
 */
export default function StatsScreen() {
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState<StatsView>("personal");
  const [stats, setStats] = useState<UserStats>({ total_co2_saved: 0, total_trips: 0, this_week_co2: 0, last_week_co2: 0 });
  const [leaderboard, setLeaderboard] = useState<LeaderboardUser[]>([]);
  const [xpPoints, setXpPoints] = useState(0);
  const [userBadges, setUserBadges] = useState<string[]>([]);
  const [selectedBadge, setSelectedBadge] = useState<typeof BADGES[0] | null>(null);
  
  // Corporate Stats
  const [deptLeaderboard, setDeptLeaderboard] = useState<DeptLeaderboardUser[]>([]);
  const [companyBreakdown, setCompanyBreakdown] = useState<CompanyBreakdown[]>([]);
  const [companyTotals, setCompanyTotals] = useState<CompanyTotals | null>(null);
  
  // Top Commuting Modes
  const [topModes, setTopModes] = useState<TopMode[]>([]);
  const [hasCompany, setHasCompany] = useState(false);
  const [userBaselineCo2, setUserBaselineCo2] = useState(0.192);
  
  const treeScale = useRef(new Animated.Value(0.5)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;

  /**
   * Load all statistics data
   * Fetches user stats, badges, leaderboards, and corporate data
   */
  const loadStats = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      // Load profile with XP, badges, and company info
      const { data: profile } = await supabase
        .from("profiles")
        .select("xp_points, badges, company_id, department_id, baseline_co2")
        .eq("id", user.id)
        .single();

      if (profile) {
        setXpPoints(profile.xp_points || 0);
        setUserBadges(profile.badges || []);
        setHasCompany(!!profile.company_id);
        setUserBaselineCo2(profile.baseline_co2 ?? 0.192);
        
        // Animate progress bar
        const currentLevel = getLevelInfo(profile.xp_points || 0);
        Animated.timing(progressAnim, {
          toValue: currentLevel.progress,
          duration: 1000,
          useNativeDriver: false,
        }).start();
      }

      // Get user impact stats
      const { data: impactData } = await supabase.rpc("get_user_impact", { user_uuid: user.id });
      if (impactData) {
        setStats({
          total_co2_saved: impactData.total_co2_saved || 0,
          total_trips: impactData.total_trips || 0,
          this_week_co2: impactData.this_week_co2 || 0,
          last_week_co2: impactData.last_week_co2 || 0,
        });
      }

      // Get top commuting modes
      const { data: ridesData } = await supabase
        .from("rides")
        .select("transport_mode, transport_label")
        .eq("rider_id", user.id)
        .eq("status", "completed");
      
      if (ridesData && ridesData.length > 0) {
        // Group by mode and count
        const modeCount: Record<string, { label: string; count: number }> = {};
        ridesData.forEach((ride) => {
          const key = ride.transport_mode || "unknown";
          if (!modeCount[key]) {
            modeCount[key] = { label: ride.transport_label || key, count: 0 };
          }
          modeCount[key].count++;
        });
        
        // Convert to array, sort, and take top 3
        const sortedModes = Object.entries(modeCount)
          .map(([mode, data]) => ({
            mode_label: data.label,
            mode_icon: mode,
            count: data.count,
            percentage: (data.count / ridesData.length) * 100,
          }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 3);
        
        setTopModes(sortedModes);
      }

      // Get leaderboard
      const { data: leaderboardData } = await supabase.rpc("get_company_leaderboard", { user_uuid: user.id });
      if (leaderboardData) setLeaderboard(leaderboardData || []);
      
      // Load corporate stats if user has a company
      if (profile?.company_id) {
        // Department leaderboard
        const { data: deptData } = await supabase.rpc("get_department_leaderboard", { user_uuid: user.id });
        if (deptData) setDeptLeaderboard(deptData || []);
        
        // Company breakdown by department
        const { data: breakdownData } = await supabase.rpc("get_company_breakdown", { user_uuid: user.id });
        if (breakdownData) setCompanyBreakdown(breakdownData || []);
        
        // Company totals
        const { data: totalsData } = await supabase.rpc("get_company_totals", { user_uuid: user.id });
        if (totalsData && totalsData.length > 0) setCompanyTotals(totalsData[0]);
      }
    } catch (error) {
      console.error("Error loading stats:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Reload stats when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      loadStats();
    }, [loadStats])
  );

  // Animate tree scale based on CO2 saved
  useEffect(() => {
    const trees = stats.total_co2_saved / CO2_PER_TREE;
    Animated.spring(treeScale, { 
      toValue: Math.min(1.2, 0.5 + trees * 0.1), 
      useNativeDriver: true, 
      friction: 4 
    }).start();
  }, [stats.total_co2_saved, treeScale]);

  /**
   * Switch between personal, department, and company views
   */
  const switchView = useCallback((view: StatsView) => {
    setActiveView(view);
    const toValue = view === "personal" ? 0 : view === "department" ? 1 : 2;
    Animated.spring(slideAnim, { toValue, useNativeDriver: false, friction: 8 }).start();
  }, [slideAnim]);

  // Calculate derived values with useMemo for performance
  const levelInfo = useMemo(() => getLevelInfo(xpPoints), [xpPoints]);
  const treesPlanted = useMemo(() => Math.floor(stats.total_co2_saved / CO2_PER_TREE), [stats.total_co2_saved]);
  const treeProgress = useMemo(() => (stats.total_co2_saved % CO2_PER_TREE) / CO2_PER_TREE, [stats.total_co2_saved]);
  const maxBar = useMemo(() => Math.max(stats.this_week_co2, stats.last_week_co2, 1), [stats.this_week_co2, stats.last_week_co2]);
  
  // Color array for department breakdown bars
  const departmentColors = useMemo(() => [COLORS.primary, COLORS.accent, "#8BC34A", "#FF9800", "#9C27B0"], []);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Your Impact</Text>
          <Text style={styles.headerSubtitle}>Making the planet greener</Text>
        </View>
        
        {/* Segmented Control */}
        {hasCompany && (
          <View style={styles.segmentContainer}>
            <View style={styles.segmentWrapper}>
              <Animated.View 
                style={[
                  styles.segmentIndicator,
                  {
                    left: slideAnim.interpolate({
                      inputRange: [0, 1, 2],
                      outputRange: ["0%", "33.33%", "66.66%"],
                    }),
                  },
                ]} 
              />
              <TouchableOpacity 
                style={styles.segmentBtn} 
                onPress={() => switchView("personal")}
              >
                <User size={16} color={activeView === "personal" ? COLORS.white : COLORS.gray} />
                <Text style={[styles.segmentText, activeView === "personal" && styles.segmentTextActive]}>Personal</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.segmentBtn} 
                onPress={() => switchView("department")}
              >
                <Users size={16} color={activeView === "department" ? COLORS.white : COLORS.gray} />
                <Text style={[styles.segmentText, activeView === "department" && styles.segmentTextActive]}>Department</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.segmentBtn} 
                onPress={() => switchView("company")}
              >
                <Building2 size={16} color={activeView === "company" ? COLORS.white : COLORS.gray} />
                <Text style={[styles.segmentText, activeView === "company" && styles.segmentTextActive]}>Company</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ============= PERSONAL VIEW ============= */}
        {activeView === "personal" && (
          <>
        {/* Level Progress Card */}
        <View style={styles.levelCard}>
          <View style={styles.levelHeader}>
            <View style={styles.levelBadge}>
              <Trophy size={20} color={COLORS.accent} />
              <Text style={styles.levelNumber}>Level {levelInfo.level}</Text>
            </View>
            <Text style={styles.levelTitle}>{levelInfo.title}</Text>
          </View>
          
          <View style={styles.progressBarContainer}>
            <View style={styles.progressBarBg}>
              <Animated.View
                style={[
                  styles.progressBarFill,
                  {
                    width: progressAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: ["0%", "100%"],
                    }),
                  },
                ]}
              >
                <LinearGradient
                  colors={[COLORS.accent, COLORS.accentDark]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.progressGradient}
                />
              </Animated.View>
            </View>
          </View>
          
          <View style={styles.xpRow}>
            <Text style={styles.xpText}>{xpPoints} XP</Text>
            <Text style={styles.xpToNext}>{levelInfo.xpToNext} XP to Level {levelInfo.level + 1}</Text>
          </View>
        </View>

        {/* Badges Section */}
        <View style={styles.badgesSection}>
          <View style={styles.sectionHeader}>
            <Award size={20} color={COLORS.primary} />
            <Text style={styles.sectionTitle}>Trophy Cabinet</Text>
          </View>
          
          <View style={styles.badgesGrid}>
            {BADGES.map((badge) => (
              <BadgeItem
                key={badge.id}
                badge={badge}
                isUnlocked={userBadges.includes(badge.id)}
                onPress={() => setSelectedBadge(badge)}
              />
            ))}
          </View>
        </View>

        {/* Hero CO2 Card */}
        <View style={styles.heroContainer}>
          <LinearGradient colors={[COLORS.primary, COLORS.primaryDark]} style={styles.heroCard}>
            <View style={styles.heroTop}>
              <View style={styles.heroMetric}>
                <Text style={styles.heroLabel}>Total CO₂ Saved</Text>
                <Text style={styles.heroValue}>{stats.total_co2_saved.toFixed(1)}</Text>
                <Text style={styles.heroUnit}>kilograms</Text>
              </View>
              <Animated.View style={[styles.treeContainer, { transform: [{ scale: treeScale }] }]}>
                <TreeDeciduous size={80} color={COLORS.white} />
              </Animated.View>
            </View>

            <View style={styles.treesProgress}>
              <View style={styles.treesInfo}>
                <Text style={styles.treesLabel}>🌳 Trees Equivalent</Text>
                <Text style={styles.treesValue}>{treesPlanted}</Text>
              </View>
              <View style={styles.treeProgressBarBg}>
                <View style={[styles.treeProgressBarFill, { width: `${treeProgress * 100}%` }]} />
              </View>
              <Text style={styles.progressText}>{((1 - treeProgress) * CO2_PER_TREE).toFixed(1)} kg to next tree</Text>
            </View>
          </LinearGradient>
        </View>

        {/* Stats Row */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Target size={24} color={COLORS.primary} />
            <Text style={styles.statValue}>{stats.total_trips}</Text>
            <Text style={styles.statLabel}>Total Trips</Text>
          </View>
          <View style={styles.statCard}>
            <TrendingUp size={24} color={COLORS.green} />
            <Text style={styles.statValue}>{stats.this_week_co2.toFixed(1)}</Text>
            <Text style={styles.statLabel}>This Week (kg)</Text>
          </View>
        </View>

        {/* Weekly Chart */}
        <View style={styles.chartCard}>
          <Text style={styles.chartTitle}>📊 Weekly Comparison</Text>
          <View style={styles.chartContainer}>
            <View style={styles.chartBar}>
              <Text style={styles.chartBarLabel}>This Week</Text>
              <View style={styles.chartBarBg}>
                <LinearGradient
                  colors={[COLORS.primary, COLORS.primaryDark]}
                  style={[styles.chartBarFill, { width: `${(stats.this_week_co2 / maxBar) * 100}%` }]}
                />
              </View>
              <Text style={styles.chartBarValue}>{stats.this_week_co2.toFixed(1)} kg</Text>
            </View>
            <View style={styles.chartBar}>
              <Text style={styles.chartBarLabel}>Last Week</Text>
              <View style={styles.chartBarBg}>
                <View style={[styles.chartBarFillGray, { width: `${(stats.last_week_co2 / maxBar) * 100}%` }]} />
              </View>
              <Text style={styles.chartBarValue}>{stats.last_week_co2.toFixed(1)} kg</Text>
            </View>
          </View>
        </View>

        {/* Top Commuting Modes */}
        {topModes.length > 0 && (
          <View style={styles.topModesCard}>
            <View style={styles.sectionHeader}>
              <Car size={20} color={COLORS.primary} />
              <Text style={styles.sectionTitle}>Top Commuting Modes</Text>
            </View>
            <View style={styles.topModesRow}>
              {topModes.map((mode, index) => (
                <TopModeItem key={index} mode={mode} />
              ))}
            </View>
          </View>
        )}

        {/* Personal Leaderboard */}
        <View style={styles.leaderboardCard}>
          <View style={styles.sectionHeader}>
            <Users size={20} color={COLORS.dark} />
            <Text style={styles.sectionTitle}>Company Leaderboard</Text>
          </View>

          {leaderboard.length === 0 ? (
            <Text style={styles.emptyText}>No data yet. Start logging trips!</Text>
          ) : (
            leaderboard.map((user, index) => (
              <LeaderboardRow
                key={user.id}
                user={user}
                index={index}
                isCurrentUser={user.is_current_user}
                showDepartment={true}
              />
            ))
          )}
        </View>
          </>
        )}
        
        {/* ============= DEPARTMENT VIEW ============= */}
        {activeView === "department" && (
          <>
            {/* Department Stats Header */}
            <View style={styles.deptHeader}>
              <View style={styles.deptIcon}>
                <Users size={32} color={COLORS.primary} />
              </View>
              <Text style={styles.deptTitle}>Your Department</Text>
              <Text style={styles.deptSubtitle}>See how your team is performing</Text>
            </View>
            
            {/* Department Leaderboard */}
            <View style={styles.leaderboardCard}>
              <View style={styles.sectionHeader}>
                <Trophy size={20} color={COLORS.accent} />
                <Text style={styles.sectionTitle}>Department Leaders</Text>
              </View>
              
              {deptLeaderboard.length === 0 ? (
                <Text style={styles.emptyText}>No department data available</Text>
              ) : (
                deptLeaderboard.map((user, index) => (
                  <LeaderboardRow
                    key={user.user_id}
                    user={user}
                    index={index}
                    showDepartment={true}
                  />
                ))
              )}
            </View>
          </>
        )}
        
        {/* ============= COMPANY VIEW ============= */}
        {activeView === "company" && (
          <>
            {/* Company Stats Hero */}
            {companyTotals && (
              <View style={styles.companyHero}>
                <LinearGradient colors={[COLORS.dark, "#004D40"]} style={styles.companyHeroCard}>
                  <View style={styles.companyHeroIcon}>
                    <Building2 size={36} color={COLORS.accent} />
                  </View>
                  <Text style={styles.companyName}>{companyTotals.company_name}</Text>
                  <Text style={styles.companyTagline}>Making a difference together</Text>
                  
                  <View style={styles.companyStatsRow}>
                    <View style={styles.companyStat}>
                      <Text style={styles.companyStatValue}>{companyTotals.total_co2_saved.toFixed(1)}</Text>
                      <Text style={styles.companyStatLabel}>kg CO₂ Saved</Text>
                    </View>
                    <View style={styles.companyStatDivider} />
                    <View style={styles.companyStat}>
                      <Text style={styles.companyStatValue}>{companyTotals.total_trips}</Text>
                      <Text style={styles.companyStatLabel}>Total Trips</Text>
                    </View>
                    <View style={styles.companyStatDivider} />
                    <View style={styles.companyStat}>
                      <Text style={styles.companyStatValue}>{companyTotals.employee_count}</Text>
                      <Text style={styles.companyStatLabel}>Employees</Text>
                    </View>
                  </View>
                </LinearGradient>
              </View>
            )}
            
            {/* Department Breakdown Chart */}
            <View style={styles.breakdownCard}>
              <View style={styles.sectionHeader}>
                <BarChart3 size={20} color={COLORS.primary} />
                <Text style={styles.sectionTitle}>Department vs Department</Text>
              </View>
              
              {companyBreakdown.length === 0 ? (
                <Text style={styles.emptyText}>No department data available</Text>
              ) : (
                companyBreakdown.map((dept, index) => {
                  const maxCo2 = Math.max(...companyBreakdown.map(d => d.total_co2_saved), 1);
                  const barColor = departmentColors[index % departmentColors.length];
                  
                  return (
                    <DepartmentBreakdownItem
                      key={dept.department_id}
                      dept={dept}
                      maxCo2={maxCo2}
                      barColor={barColor}
                    />
                  );
                })
              )}
            </View>
          </>
        )}

        {/* Cost Savings Card — shown in personal view */}
        {activeView === "personal" && stats && (
          <View style={{ paddingHorizontal: 16 }}>
            <CostSavingsCard
              totalCo2Saved={stats.total_co2_saved ?? 0}
              tripsCompleted={stats.total_trips ?? 0}
              baselineCo2={userBaselineCo2}
            />
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Badge Modal */}
      <Modal visible={!!selectedBadge} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <TouchableOpacity style={styles.modalClose} onPress={() => setSelectedBadge(null)}>
              <X size={24} color={COLORS.gray} />
            </TouchableOpacity>
            
            {selectedBadge && (
              <>
                <View style={[styles.modalBadge, { backgroundColor: selectedBadge.color + "20" }]}>
                  <selectedBadge.icon size={48} color={selectedBadge.color} />
                </View>
                <Text style={styles.modalTitle}>{selectedBadge.name}</Text>
                <Text style={styles.modalDesc}>{selectedBadge.desc}</Text>
                <View style={styles.modalUnlocked}>
                  <Text style={styles.modalUnlockedText}>🎉 Unlocked!</Text>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  scroll: { flex: 1 },
  loadingContainer: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  headerTitle: { fontSize: 28, fontWeight: "bold", color: COLORS.dark },
  headerSubtitle: { fontSize: 14, color: COLORS.gray, marginTop: 4 },
  
  // ===== SEGMENTED CONTROL =====
  segmentContainer: { paddingHorizontal: 16, marginTop: 12, marginBottom: 8 },
  segmentWrapper: {
    flexDirection: "row",
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: 4,
    position: "relative",
    shadowColor: COLORS.black,
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  segmentIndicator: {
    position: "absolute",
    top: 4,
    bottom: 4,
    width: "33.33%",
    backgroundColor: COLORS.primary,
    borderRadius: 12,
  },
  segmentBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    zIndex: 1,
  },
  segmentText: { fontSize: 12, fontWeight: "600", color: COLORS.gray },
  segmentTextActive: { color: COLORS.white },
  
  // ===== DEPARTMENT VIEW =====
  deptHeader: {
    alignItems: "center",
    paddingVertical: 24,
    paddingHorizontal: 16,
  },
  deptIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: COLORS.primary + "20",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  deptTitle: { fontSize: 22, fontWeight: "bold", color: COLORS.dark },
  deptSubtitle: { fontSize: 14, color: COLORS.gray, marginTop: 4 },
  
  // ===== COMPANY VIEW =====
  companyHero: { paddingHorizontal: 16, marginTop: 16 },
  companyHeroCard: { borderRadius: 24, padding: 24, alignItems: "center" },
  companyHeroIcon: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: COLORS.whiteTransparent10,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  companyName: { fontSize: 24, fontWeight: "bold", color: COLORS.white },
  companyTagline: { fontSize: 14, color: COLORS.white, opacity: 0.8, marginTop: 4 },
  companyStatsRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: COLORS.whiteTransparent20,
  },
  companyStat: { flex: 1, alignItems: "center" },
  companyStatValue: { fontSize: 22, fontWeight: "bold", color: COLORS.accent },
  companyStatLabel: { fontSize: 11, color: COLORS.white, opacity: 0.8, marginTop: 4 },
  companyStatDivider: { width: 1, height: 36, backgroundColor: COLORS.whiteTransparent20 },
  
  // ===== BREAKDOWN CHART =====
  breakdownCard: {
    backgroundColor: COLORS.white,
    borderRadius: 24,
    padding: 20,
    marginHorizontal: 16,
    marginTop: 16,
    shadowColor: COLORS.black,
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
  },
  breakdownItem: { marginBottom: 16 },
  breakdownHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  breakdownDept: { fontSize: 14, fontWeight: "600", color: COLORS.dark },
  breakdownValue: { fontSize: 14, fontWeight: "bold", color: COLORS.primary },
  breakdownBarBg: { height: 12, backgroundColor: COLORS.light, borderRadius: 6, overflow: "hidden" },
  breakdownBarFill: { height: 12, borderRadius: 6 },
  breakdownEmployees: { fontSize: 11, color: COLORS.gray, marginTop: 4 },
  
  // ===== LEVEL CARD =====
  levelCard: {
    backgroundColor: COLORS.white,
    borderRadius: 24,
    padding: 20,
    marginHorizontal: 16,
    marginTop: 16,
    shadowColor: COLORS.black,
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
  },
  levelHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
  levelBadge: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: COLORS.accent + "20", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 },
  levelNumber: { fontSize: 16, fontWeight: "bold", color: COLORS.accentDark },
  levelTitle: { fontSize: 16, fontWeight: "600", color: COLORS.dark },
  progressBarContainer: { marginBottom: 12 },
  progressBarBg: { height: 12, backgroundColor: COLORS.light, borderRadius: 6, overflow: "hidden" },
  progressBarFill: { height: 12, borderRadius: 6, overflow: "hidden" },
  progressGradient: { flex: 1 },
  xpRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  xpText: { fontSize: 14, fontWeight: "bold", color: COLORS.dark },
  xpToNext: { fontSize: 12, color: COLORS.gray },
  
  // ===== BADGES SECTION =====
  badgesSection: { marginHorizontal: 16, marginTop: 20 },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 16 },
  sectionTitle: { fontSize: 18, fontWeight: "bold", color: COLORS.dark },
  badgesGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  badgeItem: { width: "30%", alignItems: "center", opacity: 0.5 },
  badgeItemUnlocked: { opacity: 1 },
  badgeCircle: { width: 60, height: 60, borderRadius: 30, backgroundColor: COLORS.light, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  badgeName: { fontSize: 11, fontWeight: "600", color: COLORS.dark, textAlign: "center" },
  badgeNameLocked: { color: COLORS.gray },
  
  // ===== HERO CO2 CARD =====
  heroContainer: { paddingHorizontal: 16, marginTop: 20 },
  heroCard: { borderRadius: 28, padding: 24, overflow: "hidden" },
  heroTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  heroMetric: { flex: 1 },
  heroLabel: { fontSize: 14, color: COLORS.white, opacity: 0.9 },
  heroValue: { fontSize: 48, fontWeight: "bold", color: COLORS.white, marginVertical: 4 },
  heroUnit: { fontSize: 16, color: COLORS.white, opacity: 0.8 },
  treeContainer: { marginTop: -10 },
  treesProgress: { marginTop: 20, backgroundColor: COLORS.whiteTransparent20, borderRadius: 16, padding: 16 },
  treesInfo: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  treesLabel: { fontSize: 14, color: COLORS.white },
  treesValue: { fontSize: 24, fontWeight: "bold", color: COLORS.white },
  treeProgressBarBg: { height: 8, backgroundColor: COLORS.whiteTransparent30, borderRadius: 4 },
  treeProgressBarFill: { height: 8, backgroundColor: COLORS.accent, borderRadius: 4 },
  progressText: { fontSize: 12, color: COLORS.white, opacity: 0.8, marginTop: 8, textAlign: "center" },
  
  // ===== STATS ROW =====
  statsRow: { flexDirection: "row", paddingHorizontal: 16, gap: 12, marginTop: 16 },
  statCard: { flex: 1, backgroundColor: COLORS.white, borderRadius: 20, padding: 20, alignItems: "center", shadowColor: COLORS.black, shadowOpacity: 0.05, shadowRadius: 10, elevation: 3 },
  statValue: { fontSize: 28, fontWeight: "bold", color: COLORS.dark, marginTop: 8 },
  statLabel: { fontSize: 12, color: COLORS.gray, marginTop: 4 },
  
  // ===== WEEKLY CHART =====
  chartCard: { backgroundColor: COLORS.white, borderRadius: 24, padding: 20, marginHorizontal: 16, marginTop: 16, shadowColor: COLORS.black, shadowOpacity: 0.05, shadowRadius: 10, elevation: 3 },
  chartTitle: { fontSize: 16, fontWeight: "bold", color: COLORS.dark, marginBottom: 16 },
  chartContainer: { gap: 16 },
  chartBar: { gap: 8 },
  chartBarLabel: { fontSize: 13, color: COLORS.gray },
  chartBarBg: { height: 24, backgroundColor: COLORS.light, borderRadius: 12, overflow: "hidden" },
  chartBarFill: { height: 24, borderRadius: 12 },
  chartBarFillGray: { height: 24, backgroundColor: COLORS.gray, borderRadius: 12, opacity: 0.3 },
  chartBarValue: { fontSize: 14, fontWeight: "bold", color: COLORS.dark },
  
  // ===== LEADERBOARD =====
  leaderboardCard: { backgroundColor: COLORS.white, borderRadius: 24, padding: 20, marginHorizontal: 16, marginTop: 16, shadowColor: COLORS.black, shadowOpacity: 0.05, shadowRadius: 10, elevation: 3 },
  emptyText: { fontSize: 14, color: COLORS.gray, textAlign: "center", paddingVertical: 20 },
  leaderboardRow: { flexDirection: "row", alignItems: "center", paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.light },
  leaderboardRowHighlight: { backgroundColor: COLORS.light, marginHorizontal: -12, paddingHorizontal: 12, borderRadius: 12 },
  leaderboardRank: { width: 36, alignItems: "center" },
  rankNumber: { fontSize: 16, fontWeight: "bold", color: COLORS.gray },
  leaderboardInfo: { flex: 1, marginLeft: 8 },
  leaderboardName: { fontSize: 15, fontWeight: "600", color: COLORS.dark },
  leaderboardNameYou: { color: COLORS.primary },
  leaderboardDept: { fontSize: 12, color: COLORS.gray, marginTop: 2 },
  leaderboardScore: { alignItems: "flex-end" },
  leaderboardValue: { fontSize: 18, fontWeight: "bold", color: COLORS.primary },
  leaderboardUnit: { fontSize: 11, color: COLORS.gray },
  
  // ===== BADGE MODAL =====
  modalOverlay: { flex: 1, backgroundColor: COLORS.blackOverlay, alignItems: "center", justifyContent: "center", padding: 24 },
  modalContent: { backgroundColor: COLORS.white, borderRadius: 28, padding: 32, width: "100%", alignItems: "center" },
  modalClose: { position: "absolute", top: 16, right: 16 },
  modalBadge: { width: 100, height: 100, borderRadius: 50, alignItems: "center", justifyContent: "center", marginBottom: 20 },
  modalTitle: { fontSize: 24, fontWeight: "bold", color: COLORS.dark, marginBottom: 8 },
  modalDesc: { fontSize: 14, color: COLORS.gray, textAlign: "center", marginBottom: 20 },
  modalUnlocked: { backgroundColor: COLORS.accent, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 16 },
  modalUnlockedText: { color: COLORS.dark, fontWeight: "bold", fontSize: 16 },
  
  // ===== TOP COMMUTING MODES =====
  topModesCard: {
    backgroundColor: COLORS.white,
    borderRadius: 24,
    padding: 20,
    marginHorizontal: 16,
    marginTop: 16,
    shadowColor: COLORS.black,
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
  },
  topModesRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginTop: 16,
  },
  topModeItem: {
    alignItems: "center",
    flex: 1,
  },
  topModeIconBox: {
    width: 56,
    height: 56,
    backgroundColor: COLORS.light,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  topModeLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: COLORS.dark,
    textAlign: "center",
    marginBottom: 4,
  },
  topModeCount: {
    fontSize: 14,
    fontWeight: "700",
    color: COLORS.primary,
  },
  topModePercentage: {
    fontSize: 11,
    color: COLORS.gray,
  },
});
