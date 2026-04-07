import { Box, Typography, Button } from '@mui/material';
import { Link } from 'react-router-dom';
import { tokens } from '../tokens';

const NotFoundPage = () => (
  <Box className="flex flex-col items-center justify-center" sx={{ minHeight: '80vh', gap: 2 }}>
    <Typography variant="h1" sx={{ fontFamily: tokens.font.mono, color: tokens.text.tertiary, fontSize: '5rem' }}>
      404
    </Typography>
    <Typography variant="h4" color="text.secondary">Page not found</Typography>
    <Button variant="outlined" component={Link} to="/inventory" sx={{ mt: 2 }}>
      Go to Inventory
    </Button>
  </Box>
);

export default NotFoundPage;
