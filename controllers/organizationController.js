const Organization = require('../models/Organization');

// 1. Create a new organization / tenant (SUPER_ADMIN only)
exports.createOrganization = async (req, res) => {
  try {
    const { name, code, email, phone, address, subscriptionPlan = 'FREE' } = req.body;

    if (!name || !code || !email) {
      return res.status(400).json({ 
        error: "Organization name, unique code, and contact email are required." 
      });
    }

    // Ensure organization code is unique (used for slug / tenant identification)
    const existingOrg = await Organization.findOne({ 
      $or: [{ code: code.toUpperCase() }, { email: email.toLowerCase() }] 
    });

    if (existingOrg) {
      return res.status(409).json({ 
        error: "An organization with this code or email already exists." 
      });
    }

    const organization = await Organization.create({
      name,
      code: code.toUpperCase(),
      email: email.toLowerCase(),
      phone,
      address,
      subscriptionPlan,
      isActive: true
    });

    res.status(201).json({
      message: "Organization created successfully.",
      organization
    });
  } catch (error) {
    res.status(500).json({ 
      error: "Failed to create organization.", 
      details: error.message 
    });
  }
};

// 2. Get all organizations with pagination & status filters (SUPER_ADMIN only)
exports.getAllOrganizations = async (req, res) => {
  try {
    const { isActive, plan, search, page = 1, limit = 20 } = req.query;

    const filter = {};
    if (isActive !== undefined) filter.isActive = isActive === 'true';
    if (plan) filter.subscriptionPlan = plan;
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { code: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    const organizations = await Organization.find(filter)
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ createdAt: -1 });

    const total = await Organization.countDocuments(filter);

    res.status(200).json({
      organizations,
      totalPages: Math.ceil(total / limit),
      currentPage: Number(page),
      totalOrganizations: total
    });
  } catch (error) {
    res.status(500).json({ 
      error: "Failed to fetch organizations.", 
      details: error.message 
    });
  }
};

// 3. Toggle organization active status (Deactivate / Reactivate tenant)
exports.toggleOrganizationStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;

    if (typeof isActive !== 'boolean') {
      return res.status(400).json({ error: "isActive status boolean is required." });
    }

    const organization = await Organization.findByIdAndUpdate(
      id,
      { isActive },
      { new: true }
    );

    if (!organization) {
      return res.status(404).json({ error: "Organization not found." });
    }

    res.status(200).json({
      message: `Organization ${isActive ? 'activated' : 'deactivated'} successfully.`,
      organization
    });
  } catch (error) {
    res.status(500).json({ 
      error: "Failed to update organization status.", 
      details: error.message 
    });
  }
};

// 4. Get active organization profile details (Scoped to current tenant)
exports.getOrganizationProfile = async (req, res) => {
  try {
    const organization = await Organization.findById(req.organizationId);

    if (!organization) {
      return res.status(404).json({ error: "Organization profile not found." });
    }

    res.status(200).json({ organization });
  } catch (error) {
    res.status(500).json({ 
      error: "Failed to fetch organization profile.", 
      details: error.message 
    });
  }
};

// 5. Update organization settings / profile (ORG_ADMIN)
exports.updateOrganizationProfile = async (req, res) => {
  try {
    const { name, phone, address, logoUrl, settings } = req.body;

    const organization = await Organization.findByIdAndUpdate(
      req.organizationId,
      {
        ...(name && { name }),
        ...(phone && { phone }),
        ...(address && { address }),
        ...(logoUrl && { logoUrl }),
        ...(settings && { settings })
      },
      { new: true, runValidators: true }
    );

    if (!organization) {
      return res.status(404).json({ error: "Organization not found." });
    }

    res.status(200).json({
      message: "Organization profile updated successfully.",
      organization
    });
  } catch (error) {
    res.status(500).json({ 
      error: "Failed to update organization profile.", 
      details: error.message 
    });
  }
};