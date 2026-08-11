const bcrypt = require('bcryptjs');
const Organization = require('../models/Organization');
const User = require('../models/User');

async function seedSystem() {
  try {
    // 1. Ensure Host Organization Exists
    let hostOrg = await Organization.findOne({ isHost: true });
    if (!hostOrg) {
      hostOrg = await Organization.create({
        name: "Savvy Scholars Tutors",
        code: "SST",
        isHost: true,
        contactInfo: { 
          email: "savvyscholarstutors@gmail.com", 
          phone: "+2349063771245" 
        },
        features: {
          onlineTutoring: true,
          offlineClasses: true,
          customQuizzes: true,
          itemBankAccess: true,
          proctoredExams: true,
          candidateSelfRegistration: true
        }
      });
      console.log("✅ Host Organization initialized:", hostOrg.name);
    }

    // 2. Ensure System Admin User Exists
    let systemUser = await User.findOne({ email: "savvyscholarstutors@gmail.com" });
    if (!systemUser) {
      const defaultPassword = process.env.SUPER_ADMIN_PASSWORD || "AdminPass123!";
      const hashedPassword = await bcrypt.hash(defaultPassword, 10);

      systemUser = await User.create({
        organizationId: hostOrg._id,
        firstName: "System",
        lastName: "Administrator",
        email: "savvyscholarstutors@gmail.com",
        gender: "Male",
        phone: "+2349063771245",
        regNo: "SYS-001",
        password: hashedPassword,
        role: "SUPER_ADMIN",
        status: "ACTIVE"
      });
      console.log("✅ System Admin User initialized:", systemUser.email);
    }
  } catch (error) {
    console.error("❌ System seeding failed:", error.message);
  }
}

module.exports = seedSystem;