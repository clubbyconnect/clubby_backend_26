const serverErrorHandler = require("../utils/serverErrorHandler.js");
const User = require("../models/user.js");
const CategoryModel = require("../models/categorySchema.js");
const admin = require('firebase-admin');

//Firebase-setup
const serviceAccount = {
  type : process.env.type,
  project_id : process.env.project_id,
  private_key_id :process.env.private_key_id,
  private_key :process.env.private_key,
  client_email : process.env.client_email,
  client_id : process.env.client_id,
  auth_uri : process.env.auth_uri,
  token_uri : process.env.token_uri,
  auth_provider_x509_cert_url : process.env.auth_provider_x509_cert_url,
  client_x509_cert_url : process.env.client_x509_cert_url,
  universe_domain : process.env.universe_domain
}
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});



// controllers-----------------------------------

exports.sendPushNotification = async (req, res) => {
  const { token, message, title } = req.body;
  try {
      const payload = {
        notification: {
          title,
          body: message,
        },
      };
    
      admin.messaging().sendToDevice(token, payload)
        .then(response => {
          return res.status(200).json({message: "Successfully sent message", data : response});
        })
        .catch(error => {
          return res.status(404).json({ error: "Error sending message" });
        });
  } catch (error) {
    serverErrorHandler(error, res);
  }
};

exports.fetchallcategory = async (req, res) => {
  try {
    const allcategory = await CategoryModel.aggregate([
      {
        $lookup: {
          from: "categories",
          localField: "_id",
          foreignField: "subcategories",
          as: "parentCategories",
        },
      },
      {
        $match: {
          parentCategories: { $size: 0 },
        },
      },
      {
        $project: {
          name: 1,
        },
      },
    ]);

console.log("allcategory????????????",allcategory);


    if (allcategory && allcategory.length > 0) {
      const categoryNames = allcategory.map((category) => category.name);
      
      
      return res.status(200).json({
          message: "Top-level categories fetched successfully",
          data: categoryNames,
        });

    } else {
      return res.status(404).json({ error: "No top-level categories found" });
    }
  } catch (error) {
    serverErrorHandler(error, res);
  }
};

exports.fetchsubcategory = async (req, res) => {
  try {
    const { parentCategoryName } = req.body;

    const subcategories = await CategoryModel.aggregate([
      {
        $match: {
          name: parentCategoryName,
        },
      },
      {
        $lookup: {
          from: "categories",
          localField: "subcategories",
          foreignField: "_id",
          as: "subcategories",
        },
      },
      {
        $unwind: "$subcategories",
      },
      {
        $project: {
          _id: 0,
          name: "$subcategories.name",
        },
      },
    ]);

    if (subcategories && subcategories.length > 0) {
      const subcategoryNames = subcategories.map((category) => category.name);
      return res
        .status(200)
        .json({
          message: "Subcategories fetched successfully",
          data: subcategoryNames,
        });
    } else {
      return res
        .status(404)
        .json({
          error: "No subcategories found for the parent category name",
        });
    }
  } catch (error) {
    serverErrorHandler(error, res);
  }
};
