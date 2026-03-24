import { ScrollView, Text, TouchableOpacity, View, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { ArrowLeft } from "lucide-react-native";

const COLORS = {
  primary: "#26C6DA",
  primaryDark: "#006064",
  dark: "#006064",
  light: "#E0F7FA",
  background: "#F5FAFA",
  white: "#FFFFFF",
  gray: "#90A4AE",
  textSecondary: "#546E7A",
  border: "#E5E7EB",
};

const LAST_UPDATED = "24 March 2026";
const VERSION = "1.0";

const SECTIONS = [
  {
    title: "1. Introduction",
    body: `These Terms and Conditions ("Terms") govern your access to and use of the Clyzio mobile application ("App") provided by Clyzio MB, a company incorporated under the laws of the Republic of Lithuania (company code 307107260), with its registered address at Polocko g. 2-2, LT-01204 Vilnius ("Clyzio", "we", "us", or "our").

By creating an account or using the App, you confirm that you have read, understood, and agree to be bound by these Terms. If you do not agree to these Terms, please do not use the App.`,
  },
  {
    title: "2. Services",
    body: `The App provides a sustainable commuting platform that enables users to:

• Track and log daily commuting trips and transport modes
• Calculate and monitor their personal CO₂ footprint savings
• Participate in corporate carpooling and ride-matching
• Receive AI-powered commute suggestions and personalised insights
• Earn experience points (XP), level up, and unlock eco badges
• Participate in company-wide sustainability challenges

The App is intended for use by employees of organisations that have enrolled in the Clyzio corporate programme, as well as individual solo users.`,
  },
  {
    title: "3. Account Registration",
    body: `To use the App, you must create an account using a valid email address and a password of at least 6 characters. You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account.

You agree to:
• Provide accurate and complete registration information
• Keep your password secure and not share it with others
• Notify us immediately at info@clyzio.com if you suspect unauthorised access to your account
• Not create accounts on behalf of others without their consent

We reserve the right to suspend or terminate accounts that violate these Terms.`,
  },
  {
    title: "4. Acceptable Use",
    body: `You agree to use the App only for lawful purposes and in accordance with these Terms. You must not:

• Submit false or misleading trip data, locations, or transport modes
• Attempt to manipulate the XP, leaderboard, or gamification systems
• Use the App to harass, threaten, or harm other users
• Reverse engineer, decompile, or attempt to extract source code from the App
• Use automated tools, bots, or scripts to interact with the App
• Circumvent any technical restrictions or security measures
• Use the App in any way that could damage, disable, overburden, or impair its servers or networks

We reserve the right to remove any content and suspend or terminate accounts at our sole discretion if we believe a violation has occurred.`,
  },
  {
    title: "5. Location Data",
    body: `Core features of the App — including trip tracking, route optimisation, carpool matching, and CO₂ calculations — require access to your device's location services. By using these features, you consent to the collection and processing of your location data as described in our Privacy Policy.

You may revoke location permissions at any time through your device settings; however, doing so will disable core App functionality. Location data is used solely to deliver the services described herein and is not sold to third parties.`,
  },
  {
    title: "6. Corporate Accounts and Employer Visibility",
    body: `If you register using a corporate email address and your employer participates in the Clyzio platform, your aggregated and anonymised commuting statistics (such as total CO₂ saved, transport modes used, and trip frequency) may be visible to your employer's designated managers and sustainability officers within the Clyzio manager dashboard.

Your individual trip routes and exact location histories are not directly accessible to your employer. However, aggregate data that could potentially identify you (e.g., unique trip patterns) may form part of company-level analytics.

You acknowledge and consent to this level of employer data visibility by using the App with a corporate email address.`,
  },
  {
    title: "7. Intellectual Property",
    body: `All content, features, and functionality of the App — including but not limited to the software, design, text, graphics, logos, and icons — are owned by Clyzio MB or its licensors and are protected by Lithuanian and European Union intellectual property laws.

You are granted a limited, non-exclusive, non-transferable, revocable licence to use the App solely for your personal, non-commercial purposes. You may not reproduce, distribute, modify, create derivative works of, or commercially exploit any part of the App without our prior written consent.`,
  },
  {
    title: "8. Disclaimer of Warranties",
    body: `The App is provided on an "as is" and "as available" basis without any warranties of any kind, either express or implied. To the fullest extent permitted by applicable law, Clyzio MB disclaims all warranties, including but not limited to:

• Warranties of merchantability, fitness for a particular purpose, and non-infringement
• Warranties that the App will be uninterrupted, error-free, or free of viruses or harmful components
• Warranties regarding the accuracy or reliability of CO₂ calculations, AI suggestions, or other data

CO₂ savings estimates are calculated using publicly available emission factors and are provided for informational purposes only. They do not constitute formal environmental reporting.`,
  },
  {
    title: "9. Limitation of Liability",
    body: `To the maximum extent permitted by Lithuanian and European Union law, Clyzio MB and its directors, employees, and affiliates shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising out of or related to your use of the App, including but not limited to loss of data, loss of profits, or business interruption.

Our total liability to you for any claims arising under these Terms shall not exceed the amount you have paid to us (if any) in the twelve months preceding the claim.

Nothing in these Terms limits liability for death or personal injury caused by our negligence, or for fraud or fraudulent misrepresentation.`,
  },
  {
    title: "10. Changes to the App and Terms",
    body: `We may update these Terms from time to time. When we make material changes, we will notify you through the App or via email. Your continued use of the App after the effective date of the revised Terms constitutes your acceptance of the changes.

We may also modify, suspend, or discontinue the App or any feature at any time with or without notice, and we shall not be liable to you or any third party for any such changes.`,
  },
  {
    title: "11. Termination",
    body: `You may delete your account at any time through the Settings screen. Upon account deletion, your personal data will be handled in accordance with our Privacy Policy.

We may terminate or suspend your access to the App at any time, with or without notice, if we believe you have violated these Terms or applicable law, or for any other reason at our sole discretion.`,
  },
  {
    title: "12. Governing Law and Dispute Resolution",
    body: `These Terms are governed by and construed in accordance with the laws of the Republic of Lithuania, without regard to its conflict of law principles.

Any disputes arising out of or in connection with these Terms shall first be attempted to be resolved through good-faith negotiation. If that fails, disputes shall be subject to the exclusive jurisdiction of the courts of Vilnius, Lithuania.

If you are a consumer located in the European Union, you may also have the right to seek alternative dispute resolution through the European Commission's Online Dispute Resolution platform.`,
  },
  {
    title: "13. Contact Us",
    body: `If you have any questions about these Terms, please contact us:

Clyzio MB
Company code: 307107260
Address: Polocko g. 2-2, LT-01204 Vilnius, Lithuania
Email: info@clyzio.com
Phone: +370 615 41336`,
  },
];

export default function TermsScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <ArrowLeft size={22} color={COLORS.dark} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Terms & Conditions</Text>
          <Text style={styles.headerSub}>Version {VERSION} · {LAST_UPDATED}</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Intro banner */}
        <LinearGradient
          colors={[COLORS.primary, COLORS.primaryDark]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.introBanner}
        >
          <Text style={styles.introBannerTitle}>Terms & Conditions</Text>
          <Text style={styles.introBannerSub}>
            Please read these terms carefully before using the Clyzio app.
          </Text>
          <View style={styles.introPill}>
            <Text style={styles.introPillText}>Last updated: {LAST_UPDATED}</Text>
          </View>
        </LinearGradient>

        {/* Sections */}
        {SECTIONS.map((section, i) => (
          <View key={i} style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <Text style={styles.sectionBody}>{section.body}</Text>
          </View>
        ))}

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            © {new Date().getFullYear()} Clyzio MB · All rights reserved
          </Text>
        </View>

        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: COLORS.background,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCenter: { flex: 1, alignItems: "center" },
  headerTitle: { fontSize: 17, fontWeight: "700", color: COLORS.dark },
  headerSub: { fontSize: 12, color: COLORS.gray, marginTop: 2 },

  scroll: { flex: 1 },
  scrollContent: { padding: 16 },

  introBanner: {
    borderRadius: 20,
    padding: 24,
    marginBottom: 20,
  },
  introBannerTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: COLORS.white,
    marginBottom: 8,
  },
  introBannerSub: {
    fontSize: 14,
    color: "rgba(255,255,255,0.85)",
    lineHeight: 21,
    marginBottom: 16,
  },
  introPill: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 50,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  introPillText: { fontSize: 12, fontWeight: "600", color: COLORS.white },

  section: {
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: 18,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: COLORS.dark,
    marginBottom: 10,
  },
  sectionBody: {
    fontSize: 14,
    color: COLORS.textSecondary,
    lineHeight: 22,
  },

  footer: {
    alignItems: "center",
    paddingVertical: 20,
  },
  footerText: { fontSize: 12, color: COLORS.gray },
});
