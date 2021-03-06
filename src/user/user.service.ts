import {
    BadRequestException,
    Injectable,
    NotAcceptableException,
    NotFoundException,
    UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { JwtPayload } from 'jsonwebtoken';
import { Model } from 'mongoose';
import { iDocument } from '../document/entities/document.entity';
import { AuthService } from '../auth/auth.service';
import { BcryptService } from '../auth/bcrypt.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { iUser } from './entities/user.entity';

@Injectable()
export class UserService {
    constructor(
        @InjectModel('User') private readonly User: Model<iUser>,
        @InjectModel('Document') private readonly Document: Model<iDocument>,
        private readonly auth: AuthService,
        private readonly bcrypt: BcryptService
    ) {}
    async create(createUserDto: CreateUserDto) {
        try {
            const newUser = await this.User.create({
                ...createUserDto,
                password: this.bcrypt.encrypt(createUserDto.password),
            });
            const token = this.auth.createToken(newUser.id);
            return { user: newUser, token };
        } catch (e) {
            throw new BadRequestException('Validation error');
        }
    }

    async login(loginData: { email: string; password: string }) {
        const findUser = await this.User.findOne({
            email: loginData.email,
        })
            .populate('myDocuments', { author: 0 })
            .populate({
                path: 'myFavs',
                populate: { select: 'name', path: 'author' },
            });
        if (!findUser) throw new NotFoundException('User does not exist');
        if (!this.bcrypt.compare(loginData.password, findUser.password))
            throw new UnauthorizedException('Login data incorrect');
        const token = this.auth.createToken(findUser.id);
        return { user: findUser, token };
    }

    async loginWithToken(token: string) {
        let decodedToken: string | JwtPayload;
        try {
            decodedToken = this.auth.decodeToken(token.substring(7));
        } catch (e) {
            throw new UnauthorizedException('Session expired');
        }
        if (typeof decodedToken === 'string') {
            throw new UnauthorizedException('Token error, not valid');
        } else {
            const user = await this.User.findById(decodedToken.id)
                .populate('myDocuments', { author: 0 })
                .populate({
                    path: 'myFavs',
                    populate: { select: 'name', path: 'author' },
                });
            if (!user) throw new NotFoundException('User not found');
            //refrescamos token
            const newToken = this.auth.createToken(user.id);
            return { user, token: newToken };
        }
    }

    async findAll() {
        return await this.User.find()
            .populate('myDocuments', { author: 0 })
            .populate({
                path: 'myFavs',
                populate: { select: 'name', path: 'author' },
            });
    }

    async findOne(id: string) {
        if (id.length !== 24)
            throw new NotAcceptableException('ID format not valid');
        return await this.User.findById(id)
            .populate('myDocuments', { author: 0 })
            .populate({
                path: 'myFavs',
                populate: { select: 'name', path: 'author' },
            });
    }

    async update(token: string, updateUserDto: UpdateUserDto) {
        if (!token) throw new UnauthorizedException("Token doesn't exist");
        let decodedToken: string | JwtPayload;
        try {
            decodedToken = this.auth.decodeToken(token.substring(7));
        } catch (e) {
            throw new UnauthorizedException('Session expired');
        }
        if (typeof decodedToken === 'string') {
            throw new UnauthorizedException('Token error, not valid');
        }
        if (updateUserDto.password) {
            updateUserDto.password = this.bcrypt.encrypt(
                updateUserDto.password
            );
        }
        if (updateUserDto.role === 'admin') updateUserDto.role = 'user'; //security control
        return await this.User.findByIdAndUpdate(
            decodedToken.id,
            updateUserDto,
            {
                new: true,
            }
        )
            .populate('myDocuments', { author: 0 })
            .populate({
                path: 'myFavs',
                populate: { select: 'name', path: 'author' },
            });
    }

    async remove(id: string) {
        if (id.length !== 24)
            throw new NotAcceptableException('ID format not valid');
        const findUser = await this.User.findById(id);
        if (!findUser) throw new NotFoundException('User not found');
        const findDocuments = this.Document.find({ author: findUser.id });
        if (findDocuments) this.Document.deleteMany({ author: findUser.id });
        return await this.User.findByIdAndDelete(id);
    }

    async removeSelf(token: string) {
        if (!token) throw new UnauthorizedException("Token doesn't exist");
        let decodedToken: string | JwtPayload;
        try {
            decodedToken = this.auth.decodeToken(token.substring(7));
        } catch (e) {
            throw new UnauthorizedException('Session expired');
        }
        if (typeof decodedToken === 'string') {
            throw new UnauthorizedException('Token error, not valid');
        }
        const userId = decodedToken.id as string;
        const user = await this.User.findById(userId);
        if (!user) throw new NotFoundException('User not found');
        const findDocuments = this.Document.find({ author: user.id });
        if (findDocuments) this.Document.deleteMany({ author: user.id });
        user.delete();
        return { deleted: true };
    }
}
