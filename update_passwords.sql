UPDATE users SET password = '$2a$10$QeKhl6pH2J5QU.QVW.cB6ebvVM0FlpeDaw4f4czPqjQAXRianxjsm' WHERE email IN ('admin@kalenbenakafil.org', 'editor@kalenbenakafil.org', 'member@kalenbenakafil.org', 'volunteer@kalenbenakafil.org');
SELECT email, password FROM users;
