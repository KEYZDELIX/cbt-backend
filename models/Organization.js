const mongoose = require('mongoose');

const OrganizationSchema = new mongoose.Schema({
  // ==========================================
  // 1. IDENTIFICATION & TENANCY
  // ==========================================
  name: {
    type: String,
    required: [true, "Organization name is required"],
    trim: true,
    unique: true
  },
  code: {
    type: String,
    required: [true, "Organization short code is required"],
    uppercase: true,
    trim: true,
    unique: true // e.g., "SAVVY" for host, "GFA" for Greenfield Academy
  },
  slug: {
    type: String,
    lowercase: true,
    trim: true,
    unique: true // Used for custom portal URLs (e.g., app.com/org/greenfield-academy)
  },
  isHost: {
    type: Boolean,
    default: false,
    index: true // Key flag: TRUE for your primary organization, FALSE for tagging-along orgs
  },

  // ==========================================
  // 2. BRANDING & PORTAL CUSTOMIZATION
  // ==========================================
  branding: {
    logoUrl: { type: String, default: null },
    faviconUrl: { type: String, default: null },
    primaryColor: { type: String, default: '#0ea5e9' }, // Hex color code for customized UI
    accentColor: { type: String, default: '#0284c7' },
    portalTitle: { type: String, default: null } // Custom header text on partner dashboard
  },

  // ==========================================
  // 3. CONTACT & ADMINISTRATIVE INFO
  // ==========================================
  contactInfo: {
    email: {
      type: String,
      required: [true, "Contact email is required"],
      lowercase: true,
      trim: true
    },
    phone: { type: String, trim: true, required: true },
    address: { type: String, trim: true },
    city: { type: String, trim: true },
    state: { type: String, trim: true, default: 'Lagos' },
    country: { type: String, trim: true, default: 'Nigeria' }
  },

  // ==========================================
  // 4. FEATURE FLAGS & CAPABILITIES
  // ==========================================
  // Controls which services this specific tenant is authorized to use
  features: {
    onlineTutoring: { type: Boolean, default: false }, // Allowed ONLY for Host
    offlineClasses: { type: Boolean, default: false },  // Allowed ONLY for Host
    customQuizzes: { type: Boolean, default: true },   // Permitted for partner orgs
    itemBankAccess: { type: Boolean, default: true },  // Share global question bank
    proctoredExams: { type: Boolean, default: true },   // Permit live invigilation mode
    candidateSelfRegistration: { type: Boolean, default: true } // Allow students to register directly
  },

  // ==========================================
  // 5. FINANCIAL & REGISTRATION CONFIGURATION
  // ==========================================
  billingConfig: {
    requiresPaymentForExams: { type: Boolean, default: false },
    registrationFee: { type: Number, default: 0 }, // In NGN or base currency
    currency: { type: String, default: 'NGN', uppercase: true },
    // Since payments flow directly to the Host account, these fields track internal split calculations if needed
    hostRevenueSharePercent: { type: Number, default: 100 } // Percentage kept by Host organization
  },

  // ==========================================
  // 6. SYSTEM STATUS & LIMITS
  // ==========================================
  status: {
    type: String,
    enum: ['PENDING_APPROVAL', 'ACTIVE', 'SUSPENDED', 'ARCHIVED'],
    default: 'ACTIVE',
    index: true
  },
  maxCandidatesAllowed: { 
    type: Number, 
    default: 500 // Optional cap for partner organization candidate pools
  }
}, { 
  timestamps: true 
});

// ==========================================
// INDEXES & MIDDLEWARE
// ==========================================

// Fast lookup for tenant routing via URL slug or code
OrganizationSchema.index({ slug: 1 });
OrganizationSchema.index({ code: 1 });

// Auto-generate slug before saving if not explicitly provided
OrganizationSchema.pre('save', function(next) {
  if (this.isModified('name') && !this.slug) {
    this.slug = this.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)+/g, '');
  }
  next();
});

module.exports = mongoose.model('Organization', OrganizationSchema);