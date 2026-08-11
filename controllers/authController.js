const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('../models/User');

// Helper to generate JWT Token
const generateToken = (user) => {
  return jwt.sign(
    {
      id: user._id,
      role: user.role,
      organizationId: user.organizationId
    },
    process.env.JWT_SECRET || 'fallback_secret_key',
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
};

// ==========================================
// 1. UNIFIED LOGIN (Email / RegNo / Phone)
// ==========================================
exports.login = async (req, res) => {
  try {
    const { identifier, password } = req.body;

    if (!identifier || !password) {
      return res.status(400).json({ error: "Please provide your Email/Reg No and Password." });
    }

    // Determine lookup strategy: Email or RegNo
    const cleanIdentifier = identifier.trim();
    const isEmail = cleanIdentifier.includes('@');
    
    const query = isEmail 
      ? { email: cleanIdentifier.toLowerCase() } 
      : { regNo: cleanIdentifier.toUpperCase() };

    // Find user and explicitly select password field
    const user = await User.findOne(query).select('+password');

    if (!user) {
      return res.status(401).json({ error: "Invalid credentials. Account not found." });
    }

    // Account status check
    if (user.status !== 'ACTIVE') {
      return res.status(403).json({ error: `Account is currently ${user.status.toLowerCase()}. Please contact support.` });
    }

    // Verify Password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: "Invalid credentials. Password incorrect." });
    }

    const token = generateToken(user);
    user.password = undefined; // Strip hash from output

    res.status(200).json({
      success: true,
      message: "Login successful",
      token,
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        regNo: user.regNo,
        role: user.role, // Exact match with User.js enum
        organizationId: user.organizationId,
        passportUrl: user.passportUrl
      }
    });
  } catch (error) {
    res.status(500).json({ error: "Login failed.", details: error.message });
  }
};

// ==========================================
// 2. CANDIDATE SELF-REGISTRATION
// ==========================================
exports.registerCandidate = async (req, res) => {
  try {
    const { firstName, lastName, email, phone, password, regNo } = req.body;
    const organizationId = req.organizationId; // Attached via tenantContext middleware

    if (!firstName || !lastName || !password) {
      return res.status(400).json({ error: "First name, last name, and password are required." });
    }

    // Generate standard candidate registration number if omitted
    const finalRegNo = regNo 
      ? regNo.toUpperCase().trim() 
      : `SST-${Math.floor(100000 + Math.random() * 900000)}`;

    const queryConditions = [{ regNo: finalRegNo }];
    if (email) queryConditions.push({ email: email.toLowerCase().trim() });

    const existingUser = await User.findOne({
      organizationId,
      $or: queryConditions
    });

    if (existingUser) {
      return res.status(400).json({ error: "A user with this Email or Registration Number already exists." });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newCandidate = await User.create({
      organizationId,
      firstName,
      lastName,
      email: email ? email.toLowerCase().trim() : undefined,
      phone,
      regNo: finalRegNo,
      password: hashedPassword,
      role: 'CANDIDATE',
      status: 'ACTIVE'
    });

    const token = generateToken(newCandidate);
    newCandidate.password = undefined;

    res.status(201).json({
      success: true,
      message: "Registration successful",
      token,
      user: newCandidate
    });
  } catch (error) {
    res.status(500).json({ error: "Registration failed.", details: error.message });
  }
};

// ==========================================
// 3. GET CURRENT LOGGED-IN USER PROFILE
// ==========================================
exports.getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .populate('organizationId', 'name code logoUrl features')
      .select('-password');

    if (!user) {
      return res.status(404).json({ error: "User profile not found." });
    }

    res.status(200).json({ success: true, data: user });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch profile.", details: error.message });
  }
};

// ==========================================
// 4. PASSWORD CHANGE
// ==========================================
exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: "Current password and new password are required." });
    }

    const user = await User.findById(req.user.id).select('+password');

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: "Current password is incorrect." });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

    res.status(200).json({ success: true, message: "Password updated successfully." });
  } catch (error) {
    res.status(500).json({ error: "Password change failed.", details: error.message });
  }
};