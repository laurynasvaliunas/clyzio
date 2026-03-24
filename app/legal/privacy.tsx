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
  green: "#4CAF50",
};

const LAST_UPDATED = "24 March 2026";
const VERSION = "1.0";

const SECTIONS = [
  {
    title: "1. Data Controller",
    body: `This Privacy Policy describes how Clyzio MB ("Clyzio", "we", "us", or "our") collects, uses, stores, and shares your personal data when you use the Clyzio mobile application ("App").

Clyzio MB is the data controller responsible for your personal data.

Company code: 307107260
Address: Polocko g. 2-2, LT-01204 Vilnius, Lithuania
Email: info@clyzio.com
Phone: +370 615 41336

This Policy is written in compliance with the General Data Protection Regulation (EU) 2016/679 ("GDPR") and applicable Lithuanian data protection legislation.`,
  },
  {
    title: "2. Data We Collect",
    body: `We collect the following categories of personal data:

Account Data
• Email address (used for authentication and communication)
• Password (stored as a cryptographic hash — we never store plaintext passwords)
• First and last name (optional, provided by you)
• Phone number (optional, provided by you)
• Profile photo (optional, uploaded by you)

Location Data
• GPS coordinates for trip origin and destination points
• Home address and work address (optional, provided by you for AI suggestions)
• Real-time device location when actively logging a trip

Commute & Transport Data
• Transport modes used (e.g., car, bike, walking, public transport)
• Weekly commute schedule and habits
• Vehicle details (make, model, fuel type — optional)
• CO₂ baseline and savings calculations

Usage & Gamification Data
• Experience points (XP) and level progression
• Badges and achievements earned
• Trip history and completion status

Technical Data
• Device type and operating system version
• App version
• Push notification token (for reminders and alerts)
• Crash logs and error reports (anonymised)`,
  },
  {
    title: "3. Legal Basis for Processing",
    body: `We process your personal data on the following legal bases:

Performance of a Contract (Article 6(1)(b) GDPR)
Processing your account data, location data, and trip data is necessary to provide the core services of the App — including trip tracking, CO₂ calculations, carpool matching, and AI-powered suggestions.

Legitimate Interests (Article 6(1)(f) GDPR)
We process technical and usage data to improve App performance, detect and prevent fraud, and ensure security. Our legitimate interests are balanced against your rights and freedoms.

Consent (Article 6(1)(a) GDPR)
Where required by law (e.g., for marketing communications or optional analytics), we will ask for your explicit consent. You may withdraw consent at any time without affecting the lawfulness of prior processing.

Legal Obligation (Article 6(1)(c) GDPR)
In some cases we may need to process your data to comply with applicable legal obligations.`,
  },
  {
    title: "4. How We Use Your Data",
    body: `We use your personal data for the following purposes:

• Providing and operating the App and its features
• Calculating your personal CO₂ footprint savings
• Generating AI-powered commute suggestions tailored to your routes and habits
• Matching you with carpool partners at your company
• Displaying your statistics on personal and company leaderboards
• Sending push notifications for trip reminders and gamification updates
• Providing customer support and responding to your enquiries
• Improving, testing, and developing new features
• Detecting, preventing, and investigating fraud or security incidents
• Complying with applicable legal obligations`,
  },
  {
    title: "5. Data Sharing",
    body: `We do not sell your personal data. We may share your data with the following categories of recipients:

Cloud Infrastructure Provider
Your data is stored on Supabase (hosted on AWS infrastructure within the European Union). Supabase acts as a data processor under a Data Processing Agreement.

Your Employer (Corporate Users Only)
If you register with a corporate email address and your employer is enrolled in Clyzio, aggregated sustainability statistics (total CO₂ saved, trips completed, transport modes) may be visible to authorised managers in the Clyzio manager dashboard. Exact trip routes and timestamps are not directly shared with your employer.

AI Service Providers
To generate personalised commute suggestions, anonymised route and preference data may be processed by AI model providers under strict data processing agreements.

Legal and Regulatory Authorities
We may disclose your data where required to do so by applicable law, court order, or governmental authority.

No other third-party sharing occurs without your explicit consent.`,
  },
  {
    title: "6. Data Retention",
    body: `We retain your personal data for as long as your account is active and for a reasonable period thereafter to fulfil the purposes described in this Policy.

• Account and profile data: Retained until you delete your account, then deleted within 30 days (except where legal obligations require longer retention)
• Trip and location data: Retained for the lifetime of your account
• After account deletion: Most personal data is deleted within 30 days. Anonymised, aggregated data (which cannot identify you) may be retained indefinitely for analytics purposes
• Crash logs and error reports: Automatically deleted after 90 days

You may request earlier deletion of your data at any time (see Section 8).`,
  },
  {
    title: "7. Data Security",
    body: `We implement appropriate technical and organisational measures to protect your personal data against unauthorised access, alteration, disclosure, or destruction. These include:

• End-to-end TLS encryption for all data in transit
• Encryption at rest for stored data
• Password hashing using industry-standard algorithms (bcrypt)
• Row-level security policies in our database
• Access controls limiting employee access to personal data
• Regular security reviews and vulnerability assessments

Despite these measures, no method of electronic transmission or storage is 100% secure. We cannot guarantee absolute security of your data.`,
  },
  {
    title: "8. Your Rights Under GDPR",
    body: `As a data subject in the European Union, you have the following rights:

Right of Access (Article 15)
You may request a copy of the personal data we hold about you.

Right to Rectification (Article 16)
You may request correction of inaccurate or incomplete personal data.

Right to Erasure (Article 17)
You may request deletion of your personal data ("right to be forgotten") in certain circumstances. You can delete your account directly from Settings → Danger Zone.

Right to Restriction (Article 18)
You may request that we restrict the processing of your data in certain circumstances.

Right to Data Portability (Article 20)
You may request a copy of your data in a structured, machine-readable format.

Right to Object (Article 21)
You may object to processing based on legitimate interests.

Right to Withdraw Consent
Where processing is based on consent, you may withdraw it at any time without affecting the lawfulness of prior processing.

To exercise any of these rights, please contact us at info@clyzio.com. We will respond within 30 days. You also have the right to lodge a complaint with the State Data Protection Inspectorate of Lithuania (www.ada.lt) or any other EU supervisory authority.`,
  },
  {
    title: "9. Children's Privacy",
    body: `The App is not directed at children under the age of 16. We do not knowingly collect personal data from children. If we become aware that a child under 16 has provided personal data, we will delete it promptly. If you believe a child has provided us with personal data, please contact us at info@clyzio.com.`,
  },
  {
    title: "10. International Data Transfers",
    body: `Your personal data is stored on servers within the European Union. If any processing occurs outside the EEA (for example, by AI service providers), we ensure that appropriate safeguards are in place — such as Standard Contractual Clauses approved by the European Commission — to protect your data to an equivalent standard.`,
  },
  {
    title: "11. Changes to This Policy",
    body: `We may update this Privacy Policy from time to time. We will notify you of material changes through the App or via email before the changes take effect. The "Last Updated" date at the top of this Policy reflects when it was last revised.

Your continued use of the App after the effective date of the revised Policy constitutes your acknowledgement of the changes.`,
  },
  {
    title: "12. Contact Us",
    body: `For any privacy-related questions, requests to exercise your rights, or concerns, please contact our data protection point of contact:

Clyzio MB
Company code: 307107260
Address: Polocko g. 2-2, LT-01204 Vilnius, Lithuania
Email: info@clyzio.com
Phone: +370 615 41336

We aim to respond to all enquiries within 30 days.`,
  },
];

export default function PrivacyScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <ArrowLeft size={22} color={COLORS.dark} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Privacy Policy</Text>
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
          colors={[COLORS.green, "#2E7D32"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.introBanner}
        >
          <Text style={styles.introBannerTitle}>Privacy Policy</Text>
          <Text style={styles.introBannerSub}>
            We are committed to protecting your personal data and respecting your privacy rights under GDPR.
          </Text>
          <View style={styles.introPill}>
            <Text style={styles.introPillText}>Last updated: {LAST_UPDATED}</Text>
          </View>
        </LinearGradient>

        {/* GDPR badge */}
        <View style={styles.gdprBadge}>
          <Text style={styles.gdprIcon}>🇪🇺</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.gdprTitle}>GDPR Compliant</Text>
            <Text style={styles.gdprSub}>
              Your data is processed in accordance with EU data protection law by Clyzio MB, Lithuania.
            </Text>
          </View>
        </View>

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
          <Text style={styles.footerSub}>Registered in the Republic of Lithuania</Text>
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
    marginBottom: 12,
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

  gdprBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.primary,
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  gdprIcon: { fontSize: 28 },
  gdprTitle: { fontSize: 14, fontWeight: "700", color: COLORS.dark, marginBottom: 3 },
  gdprSub: { fontSize: 12, color: COLORS.textSecondary, lineHeight: 18 },

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
    gap: 4,
  },
  footerText: { fontSize: 12, color: COLORS.gray },
  footerSub: { fontSize: 11, color: COLORS.gray },
});
