// utils/spreadsheetParser.js

const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

// IMPORTANT: This function now accepts an optional 'schoolsList' array
// This array should contain objects with _id and schoolName, like [{_id: '...', schoolName: '...'}]
const parseSpreadsheet = (filePath, schoolsList = []) => {
    return new Promise((resolve, reject) => {
        if (!fs.existsSync(filePath)) {
            return reject(new Error('File not found.'));
        }

        try {
            const workbook = XLSX.readFile(filePath);
            const sheetName = workbook.SheetNames[0]; // Get the first sheet
            const worksheet = workbook.Sheets[sheetName];

            const jsonData = XLSX.utils.sheet_to_json(worksheet, {
                raw: false,
                defval: null,
                header: 1
            });

            if (jsonData.length === 0) {
                return resolve([]); // No data rows
            }

            const headers = jsonData[0].map(h => typeof h === 'string' ? h.trim() : h);
            const dataRows = jsonData.slice(1);

            const studentsData = dataRows.map(row => {
                const student = {};
                headers.forEach((header, index) => {
                    if (!header) return;

                    const normalizedHeader = header
                        .toLowerCase()
                        .replace(/\s+/g, '')
                        .replace(/[^a-z0-9]/g, '');

                    let value = row[index];

                    if (value === undefined || value === null) {
                        value = null;
                    } else if (typeof value === 'string') {
                        value = value.trim();
                    }

                    if (normalizedHeader === 'dob' && typeof value === 'number') {
                        const excelDate = value;
                        const jsDate = new Date(Math.round((excelDate - 25569) * 24 * 60 * 60 * 1000));
                        value = jsDate.toISOString();
                    }

                    switch (normalizedHeader) {
                        case 'fullname':
                        case 'name':
                            student.name = value;
                            break;
                        case 'emailaddress':
                        case 'email':
                            student.email = value;
                            break;
                        case 'gender':
                            student.gender = value;
                            break;
                        case 'contactnumber':
                        case 'contact':
                            student.contactNumber = value;
                            break;
                        case 'address':
                            student.address = value;
                            break;
                        case 'dateofbirth':
                        case 'dob':
                            student.dob = value;
                            break;
                        case 'profilepictureurl':
                        case 'profilepicture':
                            student.profilePicture = value;
                            break;
                        case 'grade':
                            student.grade = typeof value === 'number' ? value : parseInt(value);
                            break;
                        case 'session':
                            student.session = value;
                            break;
                        case 'class':
                        case 'studentclass':
                            student.class = value;
                            break;
                            case 'section': // ADD THIS CASE
                            student.section = value;
                            break;
                        case 'rollnumber':
                        case 'rollno':
                            student.rollNumber = value;
                            break;
                        case 'schoolname':
                        case 'school':
                            // *** MODIFICATION START ***
                            if (value && schoolsList.length > 0) {
                                // Check if the value looks like a MongoDB ObjectId (24 hex characters)
                                const isObjectId = /^[0-9a-fA-F]{24}$/.test(value);
                                if (isObjectId) {
                                    // If it's an ID, find the corresponding school name
                                    const schoolFound = schoolsList.find(s => s._id.toString() === value);
                                    student.school = schoolFound ? schoolFound.schoolName : value; // Use name if found, otherwise keep the ID (for error handling/debug)
                                } else {
                                    // If it's not an ID, assume it's already the school name
                                    student.school = value;
                                }
                            } else {
                                student.school = value;
                            }
                            // *** MODIFICATION END ***
                            break;
                        case 'fathername':
                            student.fatherName = value;
                            break;
                        case 'assignedtrainerid':
                        case 'assignedtrainer':
                            student.assignedTrainer = value;
                            break;
                        case 'batch':
                            student.batch = value;
                            break;
                        default:
                            break;
                    }
                });
                // Ensure required fields for student role are set, even if null from spreadsheet
                student.role = 'student'; // Assuming bulk upload is specifically for students
                return student;
            });
            resolve(studentsData);
        } catch (error) {
            console.error('Error parsing spreadsheet:', error);
            reject(new Error('Failed to parse spreadsheet. Please ensure the file is correctly formatted and contains valid data.'));
        } finally {
            fs.unlink(filePath, (err) => {
                if (err) console.error('Error deleting local spreadsheet file:', err);
            });
        }
    });
};

module.exports = { parseSpreadsheet };