import { useState, useRef, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Animated,
} from "react-native";
import MapView, { Marker, PROVIDER_GOOGLE } from "react-native-maps";
import MapViewDirections from "react-native-maps-directions";
import * as Location from "expo-location";
import { Car, Users, UserCircle, X } from "lucide-react-native";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import BrandHeader from "../../components/BrandHeader";
import ActionDock from "../../components/ActionDock";
import TripPlannerModal from "../../components/TripPlannerModal";
import AISuggestionChip from "../../components/AISuggestionChip";
import CarpoolMatchModal from "../../components/CarpoolMatchModal";
import { supabase } from "../../lib/supabase";
import { useAIStore } from "../../store/useAIStore";

const GOOGLE_API_KEY = "AIzaSyAaQG2TsYZO_Ibp9sohoNS1XS-1DZ7UPwg";

const COLORS = {
  primary: "#26C6DA",
  accent: "#FDD835",
  white: "#FFFFFF",
  gray: "#90A4AE",
  dark: "#006064",
  green: "#4CAF50",
  black: "#000000",
  background: "#F5FAFA",
  overlay: "rgba(0, 0, 0, 0.5)",
};

type SearchStatus = 'idle' | 'searching' | 'waiting' | 'matched';

/**
 * CommuterMarker - Displays a nearby driver or rider on the map
 * Shows custom icon (car for drivers, users for riders) with color coding
 */
interface CommuterMarkerProps {
  commuter: any;
  searchMode: 'driver' | 'rider';
  onPress: () => void;
}

function CommuterMarker({ commuter, searchMode, onPress }: CommuterMarkerProps) {
  const profile = commuter.profiles;
  if (!profile) return null;

  // Determine icon and color based on search mode
  const isLookingForDriver = searchMode === 'rider';
  const markerColor = isLookingForDriver ? COLORS.primary : COLORS.accent;

  return (
    <Marker
      coordinate={{
        latitude: commuter.origin_lat,
        longitude: commuter.origin_long,
      }}
      onPress={onPress}
      tracksViewChanges={false}
    >
      {/* Custom Marker Icon - Clean, no callout */}
      <View style={[styles.customMarker, { backgroundColor: markerColor }]}>
        {isLookingForDriver ? (
          <Car size={20} color={COLORS.white} />
        ) : (
          <Users size={20} color={COLORS.white} />
        )}
      </View>
    </Marker>
  );
}

/**
 * SearchingOverlay - Displays searching/waiting state UI
 * Shows loading spinner and appropriate messages based on search status
 */
interface SearchingOverlayProps {
  status: SearchStatus;
  searchMode: 'driver' | 'rider' | null;
  matchCount: number;
  onCancel: () => void;
  onViewMap: () => void;
}

function SearchingOverlay({ status, searchMode, matchCount, onCancel, onViewMap }: SearchingOverlayProps) {
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (status === 'searching') {
      // Pulsing animation
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.15,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: true,
          }),
        ])
      ).start();
    }
  }, [status, pulseAnim]);

  const getMessage = () => {
    if (status === 'searching') {
      return searchMode === 'rider' 
        ? 'Scanning for drivers nearby...' 
        : 'Looking for passengers...';
    }
    if (status === 'waiting') {
      return searchMode === 'rider'
        ? 'No drivers available yet. We will notify you when one appears.'
        : 'Waiting for riders... Keep your app open.';
    }
    if (status === 'matched') {
      return matchCount > 0
        ? `Found ${matchCount} ${searchMode === 'rider' ? 'driver' : 'rider'}${matchCount > 1 ? 's' : ''}!`
        : 'Searching...';
    }
    return '';
  };

  const getIcon = () => {
    if (searchMode === 'rider') {
      return <Car size={32} color={COLORS.white} />;
    }
    return <Users size={32} color={COLORS.white} />;
  };

  return (
    <View style={styles.searchingOverlay}>
      <View style={styles.searchingCard}>
        {/* Icon with animation */}
        <Animated.View style={[styles.searchingIconContainer, { transform: [{ scale: pulseAnim }] }]}>
          {getIcon()}
        </Animated.View>

        {/* Status text */}
        <Text style={styles.searchingTitle}>
          {status === 'matched' ? '🎉 Match Found!' : status === 'waiting' ? '⏳ Waiting' : '🔍 Searching'}
        </Text>
        <Text style={styles.searchingMessage}>{getMessage()}</Text>

        {/* Loading spinner for searching state */}
        {status === 'searching' && (
          <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 16 }} />
        )}

        {/* Match count indicator */}
        {status === 'matched' && matchCount > 0 && (
          <View style={styles.matchCountBadge}>
            <Text style={styles.matchCountText}>{matchCount} available</Text>
          </View>
        )}

        {/* Action buttons */}
        <View style={styles.searchingActions}>
          {status === 'matched' && matchCount > 0 ? (
            <TouchableOpacity style={styles.viewMatchesBtn} onPress={onViewMap}>
              <Text style={styles.viewMatchesBtnText}>View on Map</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.cancelSearchBtn} onPress={onCancel}>
              <X size={18} color={COLORS.white} />
              <Text style={styles.cancelSearchBtnText}>Cancel Search</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
}

/**
 * RideConfirmedOverlay - Success modal after booking
 * Shows confirmation and navigation options
 */
interface RideConfirmedOverlayProps {
  partnerName: string;
  role: 'driver' | 'rider';
  onGoToUpcoming: () => void;
  onStayOnMap: () => void;
}

function RideConfirmedOverlay({ partnerName, role, onGoToUpcoming, onStayOnMap }: RideConfirmedOverlayProps) {
  return (
    <View style={styles.successOverlay}>
      <View style={styles.successCard}>
        {/* Success Icon */}
        <View style={styles.successIconContainer}>
          <Text style={styles.successIcon}>🎉</Text>
        </View>

        {/* Success Message */}
        <Text style={styles.successTitle}>Ride Confirmed!</Text>
        <Text style={styles.successMessage}>
          You have booked a {role === 'rider' ? 'ride' : 'pickup'} with{' '}
          <Text style={styles.successPartner}>{partnerName}</Text>.{'\n'}
          Check 'Upcoming' for details.
        </Text>

        {/* Action Buttons */}
        <View style={styles.successActions}>
          <TouchableOpacity style={styles.primaryButton} onPress={onGoToUpcoming}>
            <Text style={styles.primaryButtonText}>Go to Upcoming Trips</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.secondaryButton} onPress={onStayOnMap}>
            <Text style={styles.secondaryButtonText}>Stay on Map</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

/**
 * MatchCard - Bottom sheet showing detailed info about a selected commuter
 * Allows requesting a ride or offering a pickup
 */
interface MatchCardProps {
  match: any;
  searchMode: 'driver' | 'rider' | null;
  onClose: () => void;
  onRequestMatch: () => void;
  isLoading?: boolean;
}

function MatchCard({ match, searchMode, onClose, onRequestMatch, isLoading = false }: MatchCardProps) {
  return (
    <View style={styles.matchCard}>
      {/* Card Header */}
      <View style={styles.matchHeader}>
        <View style={styles.matchAvatarContainer}>
          <View style={styles.matchAvatar}>
            <UserCircle size={48} color={COLORS.primary} />
          </View>
          <View style={[styles.matchStatusDot, { backgroundColor: COLORS.green }]} />
        </View>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.matchName}>
            {match.profiles?.first_name} {match.profiles?.last_name}
          </Text>
          {match.profiles?.department && (
            <Text style={styles.matchDept}>📍 {match.profiles?.department}</Text>
          )}
          <View style={styles.matchRoleBadge}>
            <Text style={styles.matchRoleText}>
              {searchMode === 'rider' ? '🚗 Driver' : '🙋 Looking for ride'}
            </Text>
          </View>
        </View>
        <TouchableOpacity onPress={onClose} style={styles.matchCloseBtn} disabled={isLoading}>
          <Text style={styles.matchClose}>✕</Text>
        </TouchableOpacity>
      </View>

      {/* Route Information */}
      <View style={styles.matchRouteContainer}>
        <Text style={styles.matchRouteLabel}>Route</Text>
        <View style={styles.matchRoute}>
          <View style={styles.routeDotGreen} />
          <Text style={styles.matchRouteText} numberOfLines={1}>
            {match.origin_address?.split(',')[0] || 'Origin'}
          </Text>
        </View>
        <View style={styles.matchRouteLine} />
        <View style={styles.matchRoute}>
          <View style={styles.routeDotBlue} />
          <Text style={styles.matchRouteText} numberOfLines={1}>
            {match.dest_address?.split(',')[0] || 'Destination'}
          </Text>
        </View>
      </View>

      {/* Action Buttons */}
      <View style={styles.matchActions}>
        <TouchableOpacity 
          style={[styles.requestBtn, isLoading && styles.requestBtnDisabled]} 
          onPress={onRequestMatch}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator size="small" color={COLORS.white} />
          ) : (
            <Text style={styles.requestBtnText}>
              {searchMode === 'rider' ? '🚗 Request Ride' : '🙋 Offer Pickup'}
            </Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.viewProfileBtn, isLoading && styles.viewProfileBtnDisabled]}
          onPress={() => Alert.alert('Profile', 'Profile view coming soon!')}
          disabled={isLoading}
        >
          <Text style={styles.viewProfileBtnText}>View Profile</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

/**
 * MapScreen - Main component for map view
 * Handles trip planning, driver/rider matching, and route display
 */
export default function MapScreen() {
  const mapRef = useRef<MapView>(null);
  const hasAutocentered = useRef(false); // Prevent repeated auto-centering
  const router = useRouter();
  
  // ✅ MINIMAL STATE - Only trip result data
  const [showPlanner, setShowPlanner] = useState(false);
  const [activeTrip, setActiveTrip] = useState<any>(null);

  // ✅ COMMUTER RADAR STATE
  const [searchMode, setSearchMode] = useState<'driver' | 'rider' | null>(null);
  const [nearbyCommuters, setNearbyCommuters] = useState<any[]>([]);
  const [selectedMatch, setSelectedMatch] = useState<any>(null);

  // ✅ SEARCH STATUS STATE
  const [searchStatus, setSearchStatus] = useState<SearchStatus>('idle');
  const [isViewingMap, setIsViewingMap] = useState(false); // Track if overlay is dismissed

  // ✅ REQUEST STATUS STATE
  const [requestStatus, setRequestStatus] = useState<'idle' | 'loading' | 'success'>('idle');
  const [confirmedRide, setConfirmedRide] = useState<any>(null);

  // ✅ AI STATE
  const [chipDismissed, setChipDismissed] = useState(false);
  const [showCarpoolModal, setShowCarpoolModal] = useState(false);
  const { commuteResult, isLoadingCommute, fetchCommuteSuggestions, carpoolResult, isLoadingCarpool, fetchCarpoolMatches } = useAIStore();

  /**
   * ✅ AUTO-CENTER TO USER LOCATION ON MOUNT
   * Only runs once when component mounts
   */
  useEffect(() => {
    const centerToUserLocation = async () => {
      if (hasAutocentered.current) return; // Already centered

      try {
        // Check location permissions
        const { status } = await Location.getForegroundPermissionsAsync();
        
        if (status !== 'granted') {
          // Request permission if not granted
          const { status: newStatus } = await Location.requestForegroundPermissionsAsync();
          if (newStatus !== 'granted') {
            console.log('Location permission denied');
            return;
          }
        }

        // Get current position
        const location = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });

        // Animate map to user location
        if (mapRef.current) {
          mapRef.current.animateToRegion({
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
            latitudeDelta: 0.05,
            longitudeDelta: 0.05,
          }, 1000);
        }

        hasAutocentered.current = true; // Mark as centered
      } catch (error) {
        console.error('Error getting location:', error);
      }
    };

    centerToUserLocation();
  }, []); // Empty deps - only run once

  // ✅ Fetch AI commute suggestions when screen is focused (6h cache, non-blocking)
  useFocusEffect(
    useCallback(() => {
      fetchCommuteSuggestions().catch(() => {});
    }, [fetchCommuteSuggestions])
  );

  /**
   * ✅ POST-TRIP MAP RESET
   * Reset map state when returning from completed trip
   * Only runs when screen is focused and NOT during active booking flow
   */
  useFocusEffect(
    useCallback(() => {
      // Don't reset if user is in the middle of booking or viewing success
      if (requestStatus !== 'idle' || selectedMatch || isViewingMap) {
        console.log('⏸️ Skipping reset - user is interacting');
        return;
      }

      // Check if we're returning from a completed trip
      const resetIfNeeded = async () => {
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) return;

          // Check if user has any scheduled OR active trips
          const { data: trips } = await supabase
            .from('rides')
            .select('id')
            .in('status', ['scheduled', 'active']) // ✅ Include scheduled trips!
            .or(`driver_id.eq.${user.id},rider_id.eq.${user.id}`)
            .limit(1);

          // If no trips and we have state, reset the map
          if (!trips || trips.length === 0) {
            if (activeTrip || searchMode || nearbyCommuters.length > 0) {
              console.log('🔄 Resetting map to initial state');
              setActiveTrip(null);
              setSearchMode(null);
              setNearbyCommuters([]);
              setSelectedMatch(null);
              setSearchStatus('idle');
              setIsViewingMap(false);
              setRequestStatus('idle');
              setConfirmedRide(null);
              
              // Re-center map to user location
              const location = await Location.getCurrentPositionAsync({
                accuracy: Location.Accuracy.Balanced,
              });
              
              if (mapRef.current) {
                mapRef.current.animateToRegion({
                  latitude: location.coords.latitude,
                  longitude: location.coords.longitude,
                  latitudeDelta: 0.05,
                  longitudeDelta: 0.05,
                }, 1000);
              }
            }
          }
        } catch (error) {
          console.error('Error in reset check:', error);
        }
      };

      // Small delay to prevent racing with state updates
      const timeoutId = setTimeout(resetIfNeeded, 300);
      return () => clearTimeout(timeoutId);
    }, [activeTrip, searchMode, nearbyCommuters, requestStatus, selectedMatch, isViewingMap])
  );

  /**
   * Generate mock nearby commuters for demo/testing
   */
  const generateMockCommuters = useCallback((origin: any, role: 'driver' | 'rider', count: number = 3) => {
    const mockCommuters = [];
    for (let i = 0; i < count; i++) {
      // Generate random coordinates near origin (±0.01 degrees, ~1km)
      const latOffset = (Math.random() - 0.5) * 0.02;
      const lngOffset = (Math.random() - 0.5) * 0.02;
      
      mockCommuters.push({
        id: `mock-${Date.now()}-${i}`,
        origin_lat: origin.lat + latOffset,
        origin_long: origin.lng + lngOffset,
        dest_lat: origin.lat + (Math.random() - 0.5) * 0.05,
        dest_long: origin.lng + (Math.random() - 0.5) * 0.05,
        origin_address: `${Math.floor(Math.random() * 900) + 100} Main St, City`,
        dest_address: `${Math.floor(Math.random() * 900) + 100} Oak Ave, City`,
        status: 'active',
        driver_id: role === 'rider' ? `mock-driver-${i}` : null,
        rider_id: role === 'driver' ? `mock-rider-${i}` : null,
        profiles: {
          id: `mock-user-${i}`,
          first_name: ['Alex', 'Sam', 'Jordan', 'Taylor', 'Morgan'][i % 5],
          last_name: ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones'][i % 5],
          department: ['Marketing', 'Engineering', 'Sales', 'HR', 'Finance'][i % 5],
          avatar_url: null,
        },
      });
    }
    return mockCommuters;
  }, []);

  /**
   * ✅ FETCH NEARBY COMMUTERS - For Driver/Rider matching
   * Fetches available drivers (if user is rider) or riders (if user is driver)
   * Uses a two-step query: rides first, then profiles, to avoid complex joins
   * Falls back to mock data if no real matches found
   */
  const fetchNearbyCommuters = useCallback(async (role: 'driver' | 'rider', origin: any) => {
    try {
      setSearchStatus('searching');
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Determine opposite role to search for
      const searchRole = role === 'driver' ? 'rider' : 'driver';
      const searchColumn = `${searchRole}_id`;
      
      // Step 1: Query rides that are scheduled or active
      const { data: rides, error: ridesError } = await supabase
        .from('rides')
        .select('id, origin_lat, origin_long, dest_lat, dest_long, origin_address, dest_address, status, scheduled_at, driver_id, rider_id')
        .in('status', ['scheduled', 'active', 'requested'])
        .not(searchColumn, 'is', null)
        .neq(searchColumn, user.id) // Exclude self
        .limit(20);

      if (ridesError) {
        console.error('Error fetching nearby rides:', ridesError);
        setSearchStatus('waiting');
        return;
      }

      if (!rides || rides.length === 0) {
        console.log('No nearby commuters found - generating mock data');
        
        // Generate mock data for demo
        const mockData = generateMockCommuters(origin, role, 2);
        setNearbyCommuters(mockData);
        
        if (mockData.length > 0) {
          setSearchStatus('matched');
        } else {
          setSearchStatus('waiting');
        }
        return;
      }

      // Step 2: Fetch profile details for each commuter
      const userIds = rides.map((ride: any) => ride[searchColumn]).filter(Boolean);
      
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, department, avatar_url')
        .in('id', userIds);

      if (profilesError) {
        console.error('Error fetching commuter profiles:', profilesError);
        setNearbyCommuters(rides); // Show rides even if profile fetch fails
        setSearchStatus(rides.length > 0 ? 'matched' : 'waiting');
        return;
      }

      // Step 3: Merge rides with profile data
      const commutersWithProfiles = rides.map((ride: any) => ({
        ...ride,
        profiles: profiles?.find((p: any) => p.id === ride[searchColumn]) || null,
      }));

      console.log('✅ Found nearby commuters:', commutersWithProfiles.length);
      setNearbyCommuters(commutersWithProfiles);
      setSearchStatus(commutersWithProfiles.length > 0 ? 'matched' : 'waiting');
    } catch (error) {
      console.error('Error in fetchNearbyCommuters:', error);
      setSearchStatus('waiting');
    }
  }, [generateMockCommuters]);

  /**
   * ✅ SINGLE CALLBACK - Receives completed trip data from modal
   * This is called ONCE when user submits, not on every keystroke
   * Initiates search mode for driver/rider roles
   */
  const handleTripStart = async (tripData: any) => {
    console.log("✅ Trip Started:", tripData);
    
    // Set active trip
    setActiveTrip(tripData);
    
    // Reset viewing state for new search
    setIsViewingMap(false);

    // ✅ ACTIVATE COMMUTER RADAR if Driver or Rider role
    if (tripData.role === 'driver' || tripData.role === 'rider') {
      setSearchMode(tripData.role);
      
      // Close modal BEFORE starting search
      setShowPlanner(false);
      
      // Start searching (this will update searchStatus internally)
      await fetchNearbyCommuters(tripData.role, tripData.origin);
    } else {
      // Solo trip - close modal immediately and show route
      setShowPlanner(false);
      setSearchMode(null);
      setNearbyCommuters([]);
      setSearchStatus('idle');
    }

    // Fit map to route (including waypoint if present)
    if (mapRef.current && tripData.origin && tripData.destination) {
      const coordinates = [
        { latitude: tripData.origin.lat, longitude: tripData.origin.lng },
      ];
      
      // Include waypoint if present
      if (tripData.waypoint) {
        coordinates.push({ latitude: tripData.waypoint.lat, longitude: tripData.waypoint.lng });
      }
      
      coordinates.push({ latitude: tripData.destination.lat, longitude: tripData.destination.lng });
      
      mapRef.current.fitToCoordinates(coordinates, {
        edgePadding: { top: 100, right: 50, bottom: 350, left: 50 },
        animated: true,
      });
    }
  };

  /**
   * Cancel search and reset to initial state (full reset)
   */
  const handleCancelSearch = useCallback(() => {
    setSearchStatus('idle');
    setSearchMode(null);
    setNearbyCommuters([]);
    setSelectedMatch(null);
    setActiveTrip(null);
    setIsViewingMap(false);
  }, []);

  /**
   * View map with matches - dismiss overlay but keep route and markers visible
   */
  const handleViewMap = useCallback(() => {
    // Dismiss the overlay by setting isViewingMap to true
    // This keeps:
    // - activeTrip: route line stays visible
    // - nearbyCommuters: markers stay visible
    // - searchStatus: 'matched' allows clicking markers to show MatchCard
    setIsViewingMap(true);
  }, []);

  /**
   * ✅ REQUEST RIDE MATCH
   * Links the current user to the selected ride and confirms the booking
   * Shows success overlay with navigation options
   */
  const handleRequestMatch = useCallback(async (matchId: string) => {
    try {
      setRequestStatus('loading'); // Show loading state
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !selectedMatch) {
        setRequestStatus('idle');
        return;
      }

      const targetProfile = selectedMatch.profiles;
      if (!targetProfile) {
        Alert.alert('Error', 'Unable to find user profile.');
        setRequestStatus('idle');
        return;
      }

      // Determine which ID to update based on user's role
      const updateData: any = { status: 'scheduled' };
      
      if (searchMode === 'rider') {
        // User is a rider, joining a driver's ride
        updateData.rider_id = user.id;
      } else {
        // User is a driver, picking up a rider
        updateData.driver_id = user.id;
      }

      // Update the ride to link the users and set status to scheduled
      const { error: updateError } = await supabase
        .from('rides')
        .update(updateData)
        .eq('id', matchId);

      if (updateError) throw updateError;

      // Create a ride request record for history/approval tracking
      const { error: requestError } = await supabase
        .from('ride_requests')
        .insert({
          requester_id: user.id,
          target_id: targetProfile.id,
          ride_id: matchId,
          requester_role: searchMode,
          status: 'accepted', // Immediately accepted for instant booking
          pickup_lat: selectedMatch.origin_lat,
          pickup_long: selectedMatch.origin_long,
          pickup_address: selectedMatch.origin_address,
          dropoff_lat: selectedMatch.dest_lat,
          dropoff_long: selectedMatch.dest_long,
          dropoff_address: selectedMatch.dest_address,
          responded_at: new Date().toISOString(),
        });

      if (requestError) {
        console.warn('Request record failed:', requestError);
        // Don't fail the whole operation if this fails
      }

      // Store ride details for success overlay
      setConfirmedRide({
        partnerName: `${targetProfile.first_name} ${targetProfile.last_name || ''}`.trim(),
        role: searchMode,
      });

      // Show success overlay (DO NOT reset state here!)
      setRequestStatus('success');
      
    } catch (error: any) {
      setRequestStatus('idle');
      Alert.alert('Error', error.message || 'Failed to confirm ride. Please try again.');
    }
  }, [selectedMatch, searchMode]);

  /**
   * Navigate to Activity tab and reset map
   */
  const handleGoToUpcoming = useCallback(() => {
    // Reset map state
    setSelectedMatch(null);
    setSearchMode(null);
    setNearbyCommuters([]);
    setActiveTrip(null);
    setSearchStatus('idle');
    setIsViewingMap(false);
    setRequestStatus('idle');
    setConfirmedRide(null);
    
    // Navigate to Activity tab
    router.push('/(tabs)/activity');
  }, [router]);

  /**
   * Stay on map after booking
   */
  const handleStayOnMap = useCallback(() => {
    // Close success overlay
    setRequestStatus('idle');
    setConfirmedRide(null);
    
    // Close match card
    setSelectedMatch(null);
    
    // Keep route visible, markers visible
    // User can continue browsing other matches or plan another trip
  }, []);

  return (
    <View style={styles.container}>
      {/* ✅ MAP - Never re-renders during typing */}
      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={styles.map}
        initialRegion={{
          latitude: 37.7749,
          longitude: -122.4194,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        }}
        showsUserLocation
        showsMyLocationButton
      >
        {/* Origin Marker */}
        {activeTrip?.origin && (
          <Marker
            coordinate={{
              latitude: activeTrip.origin.lat,
              longitude: activeTrip.origin.lng,
            }}
            pinColor="green"
            title="Origin"
          />
        )}

        {/* Waypoint Marker (School/Kindergarten) */}
        {activeTrip?.waypoint && (
          <Marker
            coordinate={{
              latitude: activeTrip.waypoint.lat,
              longitude: activeTrip.waypoint.lng,
            }}
            pinColor="orange"
            title={activeTrip.waypoint.description || "Waypoint"}
          />
        )}

        {/* Destination Marker */}
        {activeTrip?.destination && (
          <Marker
            coordinate={{
              latitude: activeTrip.destination.lat,
              longitude: activeTrip.destination.lng,
            }}
            pinColor="red"
            title="Destination"
          />
        )}

        {/* Route Line (with waypoints if present) */}
        {activeTrip?.origin && activeTrip?.destination && (
          <MapViewDirections
            origin={{
              latitude: activeTrip.origin.lat,
              longitude: activeTrip.origin.lng,
            }}
            destination={{
              latitude: activeTrip.destination.lat,
              longitude: activeTrip.destination.lng,
            }}
            waypoints={activeTrip.waypoint ? [{
              latitude: activeTrip.waypoint.lat,
              longitude: activeTrip.waypoint.lng,
            }] : undefined}
            apikey={GOOGLE_API_KEY}
            strokeWidth={4}
            strokeColor={COLORS.primary}
          />
        )}

        {/* ✅ COMMUTER RADAR: Display nearby drivers/riders */}
        {searchMode && nearbyCommuters.map((commuter) => (
          <CommuterMarker
            key={commuter.id}
            commuter={commuter}
            searchMode={searchMode}
            onPress={() => setSelectedMatch(commuter)}
          />
        ))}
      </MapView>

      {/* Header */}
      <BrandHeader />

      {/* AI Suggestion Chip — shown above ActionDock when idle */}
      {!activeTrip && searchStatus === 'idle' && !chipDismissed && commuteResult?.insight && (
        <AISuggestionChip
          insight={commuteResult.insight}
          loading={isLoadingCommute}
          onPress={() => router.push('/(tabs)/ai-planner')}
          onDismiss={() => setChipDismissed(true)}
        />
      )}

      {/* Action Dock */}
      {!showPlanner && !activeTrip && searchStatus === 'idle' && (
        <ActionDock onPress={() => setShowPlanner(true)} />
      )}

      {/* ✅ ISOLATED MODAL - Memoized, never re-renders parent */}
      <TripPlannerModal
        visible={showPlanner}
        onClose={() => setShowPlanner(false)}
        onTripStart={handleTripStart}
      />

      {/* ✅ SEARCHING OVERLAY: Shows during driver/rider search, hidden when viewing map */}
      {searchStatus !== 'idle' && !selectedMatch && !isViewingMap && (
        <SearchingOverlay
          status={searchStatus}
          searchMode={searchMode}
          matchCount={nearbyCommuters.length}
          onCancel={handleCancelSearch}
          onViewMap={handleViewMap}
        />
      )}

      {/* Active Trip Summary Card - Only show for solo trips or when not searching */}
      {activeTrip && searchStatus === 'idle' && (
        <View style={styles.activeCard}>
          <View>
            <Text style={styles.activeTripTitle}>
              Trip to {activeTrip.destination.description.split(',')[0]}
            </Text>
            <Text style={styles.activeTripSubtitle}>
              {activeTrip.mode?.label || 'Rider'} · {activeTrip.role}
            </Text>
          </View>
          <TouchableOpacity 
            onPress={() => {
              setActiveTrip(null);
              setShowPlanner(true);
            }} 
            style={styles.changeBtn}
          >
            <Text style={styles.changeBtnText}>Change</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ✅ MATCH CARD: Shows when user clicks a nearby commuter marker */}
      {selectedMatch && searchStatus === 'matched' && requestStatus !== 'success' && (
        <MatchCard
          match={selectedMatch}
          searchMode={searchMode}
          onClose={() => setSelectedMatch(null)}
          onRequestMatch={() => handleRequestMatch(selectedMatch.id)}
          isLoading={requestStatus === 'loading'}
        />
      )}

      {/* ✅ SUCCESS OVERLAY: Shows after successful ride confirmation */}
      {requestStatus === 'success' && confirmedRide && (
        <RideConfirmedOverlay
          partnerName={confirmedRide.partnerName}
          role={confirmedRide.role}
          onGoToUpcoming={handleGoToUpcoming}
          onStayOnMap={handleStayOnMap}
        />
      )}

      {/* AI Match button — shown when matched and viewing map, as AI-powered alternative */}
      {searchStatus === 'matched' && searchMode && !selectedMatch && isViewingMap && (
        <TouchableOpacity
          style={styles.aiMatchBtn}
          onPress={() => {
            if (activeTrip?.origin && activeTrip?.destination) {
              fetchCarpoolMatches({
                origin_lat: activeTrip.origin.lat,
                origin_long: activeTrip.origin.lng,
                dest_lat: activeTrip.destination.lat,
                dest_long: activeTrip.destination.lng,
                departure_time: activeTrip.scheduledAt ?? new Date().toISOString(),
                role: searchMode,
              }).catch(() => {});
            }
            setShowCarpoolModal(true);
          }}
        >
          <Text style={styles.aiMatchBtnText}>✨ AI Match</Text>
        </TouchableOpacity>
      )}

      {/* Carpool Match Modal */}
      <CarpoolMatchModal
        visible={showCarpoolModal}
        result={carpoolResult}
        loading={isLoadingCarpool}
        rideId={activeTrip?.rideId ?? null}
        onClose={() => setShowCarpoolModal(false)}
        onMatchAccepted={(matchRideId) => {
          setShowCarpoolModal(false);
          handleGoToUpcoming();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  // ===== CONTAINER & MAP =====
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  
  // ===== ACTIVE TRIP CARD =====
  activeCard: {
    position: "absolute",
    bottom: 100,
    left: 20,
    right: 20,
    backgroundColor: COLORS.white,
    borderRadius: 20,
    padding: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    shadowColor: COLORS.black,
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  activeTripTitle: {
    fontWeight: "bold",
    fontSize: 16,
    color: COLORS.dark,
  },
  activeTripSubtitle: {
    color: COLORS.gray,
    marginTop: 4,
    fontSize: 14,
  },
  changeBtn: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
  },
  changeBtnText: {
    color: COLORS.white,
    fontWeight: "600",
  },
  // ===== CUSTOM MARKER STYLES =====
  customMarker: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: COLORS.white,
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  
  // ===== MATCH CARD STYLES (Bottom sheet) =====
  matchCard: {
    position: "absolute",
    bottom: 20,
    left: 20,
    right: 20,
    backgroundColor: COLORS.white,
    borderRadius: 28,
    padding: 24,
    shadowColor: COLORS.black,
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 15,
    borderWidth: 1,
    borderColor: COLORS.primary + "20",
  },
  matchHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 20,
  },
  matchAvatarContainer: {
    position: "relative",
  },
  matchAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.primary + "15",
    alignItems: "center",
    justifyContent: "center",
  },
  matchStatusDot: {
    position: "absolute",
    bottom: 2,
    right: 2,
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: COLORS.white,
  },
  matchName: {
    fontSize: 20,
    fontWeight: "bold",
    color: COLORS.dark,
  },
  matchDept: {
    fontSize: 13,
    color: COLORS.gray,
    marginTop: 4,
  },
  matchRoleBadge: {
    backgroundColor: COLORS.accent + "20",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: "flex-start",
    marginTop: 6,
  },
  matchRoleText: {
    fontSize: 11,
    color: COLORS.dark,
    fontWeight: "600",
  },
  matchCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.gray + "15",
    alignItems: "center",
    justifyContent: "center",
  },
  matchClose: {
    fontSize: 20,
    color: COLORS.gray,
    fontWeight: "400",
  },
  matchRouteContainer: {
    backgroundColor: COLORS.gray + "08",
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  matchRouteLabel: {
    fontSize: 12,
    color: COLORS.gray,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  matchRoute: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 6,
  },
  matchRouteLine: {
    width: 2,
    height: 24,
    backgroundColor: COLORS.gray + "30",
    marginLeft: 16,
    marginVertical: 2,
  },
  routeDotGreen: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: COLORS.green,
    borderWidth: 2,
    borderColor: COLORS.white,
  },
  routeDotBlue: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: COLORS.primary,
    borderWidth: 2,
    borderColor: COLORS.white,
  },
  matchRouteText: {
    fontSize: 14,
    color: COLORS.dark,
    flex: 1,
    fontWeight: "500",
  },
  matchActions: {
    gap: 12,
  },
  requestBtn: {
    backgroundColor: COLORS.primary,
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: "center",
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  requestBtnDisabled: {
    opacity: 0.6,
  },
  requestBtnText: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: "bold",
  },
  viewProfileBtn: {
    backgroundColor: COLORS.white,
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: COLORS.primary,
  },
  viewProfileBtnDisabled: {
    opacity: 0.5,
  },
  viewProfileBtnText: {
    color: COLORS.primary,
    fontSize: 15,
    fontWeight: "600",
  },
  
  // ===== SUCCESS OVERLAY STYLES =====
  successOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: COLORS.overlay,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  successCard: {
    backgroundColor: COLORS.white,
    borderRadius: 28,
    padding: 32,
    width: "100%",
    maxWidth: 400,
    alignItems: "center",
    shadowColor: COLORS.black,
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 20,
  },
  successIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.green + "20",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  successIcon: {
    fontSize: 48,
  },
  successTitle: {
    fontSize: 28,
    fontWeight: "bold",
    color: COLORS.dark,
    marginBottom: 12,
    textAlign: "center",
  },
  successMessage: {
    fontSize: 16,
    color: COLORS.gray,
    textAlign: "center",
    lineHeight: 24,
    marginBottom: 32,
  },
  successPartner: {
    fontWeight: "bold",
    color: COLORS.dark,
  },
  successActions: {
    width: "100%",
    gap: 12,
  },
  primaryButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: "center",
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  primaryButtonText: {
    color: COLORS.white,
    fontSize: 17,
    fontWeight: "bold",
  },
  secondaryButton: {
    backgroundColor: COLORS.white,
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: "center",
    borderWidth: 2,
    borderColor: COLORS.gray + "40",
  },
  secondaryButtonText: {
    color: COLORS.dark,
    fontSize: 17,
    fontWeight: "600",
  },
  
  // ===== SEARCHING OVERLAY STYLES =====
  searchingOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: COLORS.overlay,
    paddingBottom: 40,
    paddingTop: 20,
    paddingHorizontal: 20,
  },
  searchingCard: {
    backgroundColor: COLORS.white,
    borderRadius: 28,
    padding: 32,
    alignItems: "center",
    shadowColor: COLORS.black,
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 15,
  },
  searchingIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.primary + "15",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  searchingTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: COLORS.dark,
    marginBottom: 12,
    textAlign: "center",
  },
  searchingMessage: {
    fontSize: 15,
    color: COLORS.gray,
    textAlign: "center",
    lineHeight: 22,
    paddingHorizontal: 20,
  },
  matchCountBadge: {
    backgroundColor: COLORS.green + "20",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    marginTop: 16,
  },
  matchCountText: {
    fontSize: 14,
    fontWeight: "bold",
    color: COLORS.green,
  },
  searchingActions: {
    width: "100%",
    marginTop: 24,
  },
  cancelSearchBtn: {
    backgroundColor: COLORS.gray,
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
  },
  cancelSearchBtnText: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: "bold",
  },
  viewMatchesBtn: {
    backgroundColor: COLORS.primary,
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: "center",
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  viewMatchesBtnText: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: "bold",
  },

  // ===== AI MATCH BUTTON =====
  aiMatchBtn: {
    position: "absolute",
    bottom: 170,
    alignSelf: "center",
    backgroundColor: COLORS.dark,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
    shadowColor: COLORS.black,
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
  aiMatchBtnText: {
    color: COLORS.white,
    fontSize: 15,
    fontWeight: "700",
  },
});