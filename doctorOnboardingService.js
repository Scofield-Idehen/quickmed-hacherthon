// doctorOnboardingService.js - Doctor Registration & Management
const { v4: uuidv4 } = require('uuid');
const supabase = require('./supabaseClient');

class DoctorOnboardingService {
  constructor() {
    this.doctorsTable = 'doctors';
    console.log('👨‍⚕️ Doctor Onboarding Service initialized');
  }

  // ==========================================
  // DOCTOR REGISTRATION
  // ==========================================

  /**
   * Check if phone number is already a registered doctor
   */
  async isDoctorRegistered(phoneNumber) {
    try {
      const { data, error } = await supabase
        .from(this.doctorsTable)
        .select('id, full_name, specialty, registration_status, status')
        .eq('whatsapp_number', phoneNumber)
        .single();

      if (error || !data) {
        return null;
      }

      return data;
    } catch (error) {
      return null;
    }
  }

  /**
   * Create new doctor registration
   */
  async registerDoctor(registrationData) {
    try {
      console.log(`📝 Registering new doctor: ${registrationData.full_name}`);

      // Parse availability data
      const availableDays = registrationData.availableDays
        .split(',')
        .map(d => d.trim().toLowerCase());

      const availableTimes = registrationData.availableTimes
        .split(',')
        .map(t => t.trim());

      // Create available_times object (day -> times mapping)
      const availableTimesMap = {};
      availableDays.forEach(day => {
        availableTimesMap[day] = availableTimes;
      });

      const doctorData = {
        id: uuidv4(),
        full_name: registrationData.full_name,
        specialty: registrationData.specialty,
        whatsapp_number: registrationData.phoneNumber,
        license_number: registrationData.licenseNumber,
        years_experience: parseInt(registrationData.yearsExperience) || 0,
        consultation_fee: parseFloat(registrationData.consultationFee) || 5000,
        available_days: availableDays,
        available_times: availableTimesMap,
        bank_name: registrationData.bankName,
        account_number: registrationData.accountNumber,
        account_name: registrationData.accountName,
        registration_status: 'pending', // Admin approval required
        status: 'inactive', // Inactive until approved
        rating: 5.0, // Default rating
        total_appointments: 0,
        created_at: new Date().toISOString()
      };

      const { data, error } = await supabase
        .from(this.doctorsTable)
        .insert([doctorData])
        .select();

      if (error) {
        console.error('❌ Error registering doctor:', error.message);
        throw new Error('Registration failed. Please try again.');
      }

      console.log(`✅ Doctor registered successfully: ${data[0].id}`);
      return data[0];

    } catch (error) {
      console.error('❌ Error in registerDoctor:', error.message);
      throw error;
    }
  }

  /**
   * Approve doctor registration (admin function)
   */
  async approveDoctor(doctorId, approvedBy = 'admin') {
    try {
      const { data, error } = await supabase
        .from(this.doctorsTable)
        .update({
          registration_status: 'approved',
          status: 'active',
          approved_at: new Date().toISOString(),
          approved_by: approvedBy
        })
        .eq('id', doctorId)
        .select();

      if (error) throw error;

      console.log(`✅ Doctor approved: ${doctorId}`);
      return data[0];
    } catch (error) {
      console.error('❌ Error approving doctor:', error.message);
      throw error;
    }
  }

  /**
   * Get doctor by WhatsApp number
   */
  async getDoctorByPhone(phoneNumber) {
    try {
      const { data, error } = await supabase
        .from(this.doctorsTable)
        .select('*')
        .eq('whatsapp_number', phoneNumber)
        .single();

      if (error || !data) return null;
      return data;
    } catch (error) {
      return null;
    }
  }
}

module.exports = new DoctorOnboardingService();