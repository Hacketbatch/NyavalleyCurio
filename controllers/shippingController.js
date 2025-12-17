const axios = require('axios');
require('dotenv').config();

const FEDEX_URL = `${process.env.FEDEX_BASE_URL}/ship/v1/shipments`;

async function createFedExShipment(order, address) {
  try {
    const response = await axios.post(
      FEDEX_URL,
      {
        accountNumber: { value: process.env.FEDEX_ACCOUNT_NUMBER },
        requestedShipment: {
          shipper: {
            address: {
              streetLines: ["Eldoret Street 1"],
              city: "Eldoret",
              stateOrProvinceCode: "UAS",
              postalCode: "30100",
              countryCode: "KE"
            }
          },
          recipient: {
            address: {
              streetLines: [address.street_address],
              city: address.city,
              stateOrProvinceCode: address.state,
              postalCode: address.zip_code,
              countryCode: "KE"
            }
          },
          packages: [
            {
              weight: { units: "KG", value: 2.0 }
            }
          ],
          serviceType: "STANDARD_OVERNIGHT",
          packagingType: "YOUR_PACKAGING",
          shipTimestamp: new Date().toISOString()
        }
      },
      {
        headers: {
          Authorization: `Basic ${Buffer.from(`${process.env.FEDEX_API_KEY}:${process.env.FEDEX_API_SECRET}`).toString('base64')}`,
          'Content-Type': 'application/json'
        }
      }
    );

    return response.data; // Contains tracking number + label info
  } catch (error) {
    console.error("FedEx Error:", error.response?.data || error.message);
    throw new Error("Failed to create FedEx shipment");
  }
}

module.exports = { createFedExShipment };
