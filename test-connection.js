#!/usr/bin/env node

// Simple test script to verify MySQL connection outside of Cursor
import mysql from 'mysql2/promise';

const config = {
  host: process.env.MYSQL_HOST || '192.168.1.200',
  port: parseInt(process.env.MYSQL_PORT || '3306'),
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  database: process.env.MYSQL_DATABASE || 'test',
};

console.log('Testing MySQL connection with config:', {
  host: config.host,
  port: config.port,
  user: config.user,
  database: config.database,
});

async function testConnection() {
  let connection;
  try {
    console.log('\n1. Creating connection...');
    connection = await mysql.createConnection(config);
    
    console.log('✓ Connection created successfully');
    
    console.log('\n2. Testing query...');
    const [rows] = await connection.query('SELECT 1 as test');
    console.log('✓ Query executed successfully:', rows);
    
    console.log('\n3. Checking database...');
    const [dbRows] = await connection.query('SELECT DATABASE() as db');
    console.log('✓ Current database:', dbRows);
    
    console.log('\n✓✓✓ All tests passed! MySQL connection is working.\n');
    
  } catch (error) {
    console.error('\n✗✗✗ Connection failed:', error.message);
    console.error('\nError details:', {
      code: error.code,
      errno: error.errno,
      sqlState: error.sqlState,
    });
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

testConnection();
