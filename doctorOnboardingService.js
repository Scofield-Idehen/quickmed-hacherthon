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

  /**
   * Update doctor availability
   */
  async updateAvailability(phoneNumber, availableDays, availableTimes) {
    try {
      const days = availableDays.split(',').map(d => d.trim().toLowerCase());
      const times = availableTimes.split(',').map(t => t.trim());

      const availableTimesMap = {};
      days.forEach(day => {
        availableTimesMap[day] = times;
      });

      const { data, error } = await supabase
        .from(this.doctorsTable)
        .update({
          available_days: days,
          available_times: availableTimesMap,
          updated_at: new Date().toISOString()
        })
        .eq('whatsapp_number', phoneNumber)
        .select();

      if (error) throw error;

      console.log(`✅ Availability updated for doctor`);
      return data[0];
    } catch (error) {
      console.error('❌ Error updating availability:', error.message);
      throw error;
    }
  }

  /**
   * Format specialty options for WhatsApp
   */
  formatSpecialtyOptions() {
    return `Reply with number:\n` +
           `1️⃣ General Practitioner\n` +
           `2️⃣ Cardiologist\n` +
           `3️⃣ Pediatrician\n` +
           `4️⃣ Dermatologist\n` +
           `5️⃣ Gynecologist`;
  }

  /**
   * Map specialty number to name
   */
  mapSpecialty(number) {
    const specialtyMap = {
      '1': 'General Practitioner',
      '2': 'Cardiologist',
      '3': 'Pediatrician',
      '4': 'Dermatologist',
      '5': 'Gynecologist'
    };
    return specialtyMap[number.trim()];
  }

  /**
   * Format registration confirmation message
   */
  formatRegistrationConfirmation(doctor) {
    return `✅ **Registration Complete!**\n\n` +
           `👨‍⚕️ **${doctor.full_name}**\n` +
           `🏥 **Specialty:** ${doctor.specialty}\n` +
           `💰 **Fee:** ₦${doctor.consultation_fee.toLocaleString()}/consultation\n` +
           `📅 **Available:** ${doctor.available_days.join(', ')}\n` +
           `⏰ **Times:** ${Object.values(doctor.available_times)[0]?.join(', ') || 'Not set'}\n` +
           `🏦 **Bank:** ${doctor.bank_name}\n` +
           `📱 **Account:** ${doctor.account_number}\n\n` +
           `**Status:** Pending Admin Approval ⏳\n\n` +
           `You'll receive a confirmation once your application is reviewed.\n\n` +
           `Type "doctor status" to check your application status.`;
  }

  /**
   * Format doctor profile for viewing
   */
  formatDoctorProfile(doctor) {
    return `👨‍⚕️ **Your Doctor Profile**\n\n` +
           `**Name:** ${doctor.full_name}\n` +
           `**Specialty:** ${doctor.specialty}\n` +
           `**Experience:** ${doctor.years_experience} years\n` +
           `**Consultation Fee:** ₦${doctor.consultation_fee.toLocaleString()}\n` +
           `**Rating:** ${doctor.rating}/5.0 ⭐\n` +
           `**Total Appointments:** ${doctor.total_appointments}\n\n` +
           `**Availability:**\n` +
           `Days: ${doctor.available_days.join(', ')}\n` +
           `Times: ${Object.values(doctor.available_times)[0]?.join(', ') || 'Not set'}\n\n` +
           `**Bank Details:**\n` +
           `${doctor.bank_name} - ${doctor.account_number}\n\n` +
           `**Status:** ${doctor.status === 'active' ? '✅ Active' : '⏸️ Inactive'}\n` +
           `**Registration:** ${doctor.registration_status === 'approved' ? '✅ Approved' : '⏳ Pending'}\n\n` +
           `Commands:\n` +
           `• "update availability" - Change your schedule\n` +
           `• "earnings" - View your earnings\n` +
           `• "my appointments" - View upcoming appointments`;
  }

  /**
   * Get doctor's upcoming appointments
   */
  async getDoctorAppointments(doctorId, limit = 10) {
    try {
      const { data, error } = await supabase
        .from('bookings')
        .select('*')
        .eq('doctor_id', doctorId)
        .in('status', ['confirmed', 'pending'])
        .gte('appointment_date', new Date().toISOString().split('T')[0])
        .order('appointment_date', { ascending: true })
        .order('appointment_time', { ascending: true })
        .limit(limit);

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('❌ Error getting doctor appointments:', error.message);
      return [];
    }
  }

  /**
   * Format appointments list for doctor
   */
  formatDoctorAppointments(appointments) {
    if (appointments.length === 0) {
      return `📅 **No Upcoming Appointments**\n\n` +
             `You don't have any scheduled appointments yet.\n` +
             `New bookings will appear here automatically.`;
    }

    let message = `📅 **Your Upcoming Appointments (${appointments.length})**\n\n`;

    appointments.forEach((apt, index) => {
      message += `${index + 1}️⃣ **${apt.booking_reference}**\n` +
                 `   👤 Patient: ${apt.phone_number}\n` +
                 `   📅 Date: ${apt.appointment_date}\n` +
                 `   ⏰ Time: ${apt.appointment_time}\n` +
                 `   💳 Payment: ${apt.payment_status}\n` +
                 `   📹 Link: ${apt.patient_meeting_link ? 'Ready' : 'Pending'}\n\n`;
    });

    message += `Type "appointment [number]" to view details.`;
    return message;
  }
}

module.exports = new DoctorOnboardingService();